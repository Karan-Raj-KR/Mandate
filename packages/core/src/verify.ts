import { isAddressEqual, recoverTypedDataAddress } from "viem";
import { delegationId, delegationTypedData, requestTypedData, stripDelegation, stripRequest } from "./canonical.js";
import { checkAllEdges } from "./narrow.js";
import type { RegistryReader } from "./registry.js";
import { ZERO_ID, type DenyCode, type Delegation, type ExecutionRequest, type Verdict, type VerifierConfig } from "./types.js";

const deny = (code: DenyCode, detail: string): Verdict => ({ ok: false, code, detail });

/** Steps 2–12 of SPEC §6. Pure: no network. Returns the FIRST failing step's verdict,
 *  except step 8, which returns ALL edge failures in `edges`. Any throw is a deny. */
export async function verifyLocal(
  chain: Delegation[],
  req: ExecutionRequest,
  cfg: VerifierConfig,
  now: number,
): Promise<Verdict> {
  try {
    return await verifyLocalSteps(chain, req, cfg, now);
  } catch (e) {
    return deny("SCHEMA", `verification failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function verifyLocalSteps(chain: Delegation[], req: ExecutionRequest, cfg: VerifierConfig, now: number): Promise<Verdict> {
  // 2. shape
  if (!Array.isArray(chain) || chain.length === 0) return deny("EMPTY_CHAIN", "chain is empty");
  if (chain.length > cfg.maxDepth) return deny("TOO_DEEP", `chain depth ${chain.length} exceeds ${cfg.maxDepth}`);
  const root = chain[0]!;
  if (root.parent !== ZERO_ID) return deny("NOT_ROOT", "first delegation is not a root");
  for (let i = 1; i < chain.length; i++) {
    if (chain[i]!.parent === ZERO_ID) return deny("PARENT_LINK", `delegation ${i} claims to be a root`);
  }

  // 3. pinned root issuer
  if (!isAddressEqual(root.issuer, cfg.expectedRootIssuer)) {
    return deny("WRONG_ROOT", `root issuer ${root.issuer} is not the expected root`);
  }

  // 4. ids recomputed from payload, with the domain from config
  for (let i = 0; i < chain.length; i++) {
    if (delegationId(stripDelegation(chain[i]!), cfg) !== chain[i]!.id) {
      return deny("ID_MISMATCH", `delegation ${i} id does not match its payload`);
    }
  }

  // 5. issuer signatures
  for (let i = 0; i < chain.length; i++) {
    const d = chain[i]!;
    const signer = await recoverTypedDataAddress({ ...delegationTypedData(stripDelegation(d), cfg), signature: d.sig });
    if (!isAddressEqual(signer, d.issuer)) return deny("BAD_SIGNATURE", `delegation ${i} is not signed by its issuer`);
  }

  // 6. parent links
  for (let i = 1; i < chain.length; i++) {
    if (chain[i]!.parent !== chain[i - 1]!.id) return deny("PARENT_LINK", `delegation ${i} parent is not delegation ${i - 1}`);
  }

  // 7. issuer is the parent's subject
  for (let i = 1; i < chain.length; i++) {
    if (!isAddressEqual(chain[i]!.issuer, chain[i - 1]!.subject)) {
      return deny("ISSUER_LINK", `delegation ${i} issuer is not delegation ${i - 1}'s subject`);
    }
  }

  // 8. no amplification on any edge — all failures returned
  const edges = checkAllEdges(chain);
  if (edges.length > 0) {
    const where = edges.map((e) => `edge ${e.edge}: ${e.failures.map((f) => f.dimension).join(", ")}`).join("; ");
    return { ok: false, code: "AMPLIFICATION", detail: `scope expands its parent (${where})`, edges };
  }

  // 9. expiry and request deadline
  const minExpiry = Math.min(...chain.map((d) => d.scope.expiry));
  if (now >= minExpiry) return deny("EXPIRED", `chain expired at ${minExpiry}`);
  if (req.deadline <= BigInt(now) || req.deadline > BigInt(now + cfg.maxRequestTtlSeconds)) {
    return deny("DEADLINE", `request deadline must be within ${cfg.maxRequestTtlSeconds}s of now`);
  }

  // 10. audience
  if (req.audience !== cfg.serviceId) return deny("AUDIENCE", `request is for "${req.audience}", not "${cfg.serviceId}"`);

  // 11. request bound to the leaf and signed by its subject
  const leaf = chain[chain.length - 1]!;
  if (req.leafId !== leaf.id) return deny("REQUEST_SIGNATURE", "request does not reference the final delegation");
  const reqSigner = await recoverTypedDataAddress({ ...requestTypedData(stripRequest(req), cfg), signature: req.sig });
  if (!isAddressEqual(reqSigner, leaf.subject)) {
    return deny("REQUEST_SIGNATURE", "request is not signed by the final delegation's subject");
  }

  // 12. within the final scope
  const s = leaf.scope;
  if (!s.actions.includes(req.action)) return deny("OUT_OF_SCOPE", `action ${req.action} not granted`);
  if (req.amount > s.maxAmount) return deny("OUT_OF_SCOPE", `amount ${req.amount} exceeds ceiling ${s.maxAmount}`);
  const wildcard = s.targets.length === 1 && s.targets[0] === "*";
  if (!wildcard && !s.targets.includes(req.target)) return deny("OUT_OF_SCOPE", `target ${req.target} not granted`);

  return { ok: true };
}

/** Step 15. Any thrown error → REGISTRY_UNAVAILABLE.
 *  now - blockTimestamp > cfg.maxStateAgeSeconds → STALE_STATE.  revoked → REVOKED. */
export async function checkRevocation(
  chain: Delegation[],
  cfg: VerifierConfig,
  reader: RegistryReader,
  now: number,
): Promise<Verdict> {
  try {
    const { revoked, blockTimestamp } = await reader.read(
      chain.map((d) => d.issuer),
      chain.map((d) => d.id),
    );
    if (typeof revoked !== "boolean" || !Number.isFinite(blockTimestamp)) {
      return deny("REGISTRY_UNAVAILABLE", "registry returned an unexpected value");
    }
    if (now - blockTimestamp > cfg.maxStateAgeSeconds) {
      return deny("STALE_STATE", `registry state is ${now - blockTimestamp}s old (max ${cfg.maxStateAgeSeconds}s)`);
    }
    if (revoked) return deny("REVOKED", "a delegation in the chain has been revoked");
    return { ok: true };
  } catch (e) {
    return deny("REGISTRY_UNAVAILABLE", `registry read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
