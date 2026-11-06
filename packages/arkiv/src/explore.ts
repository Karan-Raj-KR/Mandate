import { hexToString, isAddressEqual, recoverTypedDataAddress } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { eq } from "@arkiv-network/sdk/query";
import {
  checkAllEdges,
  delegationId,
  delegationTypedData,
  parseDelegation,
  registryAbi,
  stripDelegation,
  ZERO_ID,
} from "@mandate/core";
import type { Delegation, VerifierConfig } from "@mandate/core";
import { DelegationSchema } from "./schema.js";

export type AuthorityRow = { d: Delegation; depth: number; status: "USABLE" | "DENIED"; reasons: string[] };
export type StatusOf = (issuers: Address[], ids: Hex[]) => Promise<boolean[]>;

/** Reads the registry's per-hop revocation flags. Any failure throws, and the caller treats a throw as DENIED. */
export function makeStatusOf(client: PublicClient, cfg: Pick<VerifierConfig, "registry">): StatusOf {
  return async (issuers, ids) => [...(await client.readContract({ address: cfg.registry, abi: registryAbi, functionName: "statusOf", args: [issuers, ids] }))];
}

function decodePayload(v: unknown): unknown {
  if (v instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(v));
  if (typeof v === "string") return JSON.parse(v.startsWith("0x") ? hexToString(v as Hex) : v);
  throw new Error("unreadable payload");
}

/** Query Arkiv for every delegation under a root, owned by one of the trusted writers.
 *  Anything that does not parse as a delegation is counted and dropped, never shown as authority. */
export async function fetchUnderRoot(
  client: { select: (...a: any[]) => any },
  rootId: Hex,
  trustedOwners: Address[],
): Promise<{ delegations: Delegation[]; unreadable: number }> {
  const delegations: Delegation[] = [];
  let unreadable = 0;
  for (const owner of trustedOwners) {
    const { entities } = await client.select({ payload: true }).from(DelegationSchema).ownedBy(owner).where(eq("rootId", rootId)).fetch();
    for (const row of entities as { payload: { value: unknown } }[]) {
      try {
        delegations.push(parseDelegation(decodePayload(row.payload.value)));
      } catch {
        unreadable++;
      }
    }
  }
  return { delegations, unreadable };
}

/**
 * Local re-verification of stored authority. Arkiv is a distribution layer, not a source of trust:
 * every id and signature is recomputed, every edge is checked with the same narrowing code the
 * payment service uses, expiry is re-checked cryptographically, and revocation is read from Ethereum.
 * A delegation is USABLE only if all of that passes for its whole path from the root.
 */
export async function verifyAuthority(
  all: Delegation[],
  rootId: Hex,
  cfg: VerifierConfig,
  now: number,
  statusOf: StatusOf,
): Promise<AuthorityRow[]> {
  const byId = new Map(all.map((d) => [d.id, d]));
  const rows: AuthorityRow[] = [];

  const walk = async (path: Delegation[]): Promise<void> => {
    const d = path[path.length - 1]!;
    const reasons: string[] = [];
    try {
      for (const [i, p] of path.entries()) {
        if (delegationId(stripDelegation(p), cfg) !== p.id) reasons.push(`hop ${i}: id does not match its payload`);
        const signer = await recoverTypedDataAddress({ ...delegationTypedData(stripDelegation(p), cfg), signature: p.sig });
        if (!isAddressEqual(signer, p.issuer)) reasons.push(`hop ${i}: not signed by its issuer`);
        if (i > 0 && !isAddressEqual(p.issuer, path[i - 1]!.subject)) reasons.push(`hop ${i}: issuer is not the parent's subject`);
        if (p.scope.expiry <= now) reasons.push(`hop ${i}: expired`);
      }
      if (!isAddressEqual(path[0]!.issuer, cfg.expectedRootIssuer)) reasons.push("root issuer is not the pinned root");
      for (const e of checkAllEdges(path)) {
        for (const f of e.failures) reasons.push(`edge ${e.edge} ${f.dimension}: ${f.reason} (${f.parentValue} -> ${f.childValue})`);
      }
      const flags = await statusOf(path.map((p) => p.issuer), path.map((p) => p.id));
      if (flags.length !== path.length) reasons.push("revocation read returned an unexpected shape");
      flags.forEach((r, i) => r && reasons.push(`hop ${i}: revoked on Ethereum`));
    } catch (e) {
      // Fail closed: if any check cannot complete, the delegation is not usable.
      reasons.push(`could not verify: ${e instanceof Error ? e.message : "error"}`);
    }
    rows.push({ d, depth: path.length - 1, status: reasons.length === 0 ? "USABLE" : "DENIED", reasons });
    for (const c of all.filter((x) => x.parent === d.id)) {
      if (!path.some((p) => p.id === c.id)) await walk([...path, c]);
    }
  };

  const root = byId.get(rootId);
  if (!root || root.parent !== ZERO_ID) throw new Error(`no root delegation ${rootId} among the stored entities`);
  await walk([root]);

  // Stored entities that no path from the root reaches are shown as denied, never silently dropped.
  const reached = new Set(rows.map((r) => r.d.id));
  for (const d of all) {
    if (!reached.has(d.id)) rows.push({ d, depth: -1, status: "DENIED", reasons: ["not reachable from the root through valid parent links"] });
  }
  return rows;
}

/** Fetch one delegation by its id from any of the trusted writers. Untrusted until verified. */
export async function fetchById(
  client: { select: (...a: any[]) => any },
  id: Hex,
  trustedOwners: Address[],
): Promise<Delegation | null> {
  for (const owner of trustedOwners) {
    const { entities } = await client.select({ payload: true }).from(DelegationSchema).ownedBy(owner).where(eq("id", id)).fetch();
    for (const row of entities as { payload: { value: unknown } }[]) {
      try {
        const d = parseDelegation(decodePayload(row.payload.value));
        if (d.id === id) return d;
      } catch {
        /* unreadable: ignore */
      }
    }
  }
  return null;
}
