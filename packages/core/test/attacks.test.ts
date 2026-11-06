import type { LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it } from "vitest";
import type { RegistryReader } from "../src/registry.js";
import { randomNonce, signDelegation, signRequest } from "../src/sign.js";
import { ZERO_ID, type Delegation, type ExecutionRequest, type Scope, type Verdict, type VerifierConfig } from "../src/types.js";
import { checkRevocation, verifyLocal } from "../src/verify.js";

// The three milestone scenarios from SPEC §9, plus copied-chain theft.

const NOW = 1_800_000_000;
const H = 3600;
const usd = (n: number) => BigInt(n) * 1_000_000n;

const owner = privateKeyToAccount(generatePrivateKey());
const ops = privateKeyToAccount(generatePrivateKey());
const procure = privateKeyToAccount(generatePrivateKey());
const settle = privateKeyToAccount(generatePrivateKey());
const thief = privateKeyToAccount(generatePrivateKey());

const cfg: VerifierConfig = {
  version: 1,
  chainId: 11155111,
  registry: "0x00000000000000000000000000000000000000aa",
  expectedRootIssuer: owner.address,
  serviceId: "payment-service",
  asset: "0x00000000000000000000000000000000000000cc",
  maxDepth: 8,
  maxStateAgeSeconds: 60,
  maxRequestTtlSeconds: 300,
  stepUpThreshold: usd(15),
};

const grant = (issuer: LocalAccount, subject: LocalAccount, parent: Delegation, scope: Scope) =>
  signDelegation(issuer, {
    v: 1, parent: parent.id, issuer: issuer.address, subject: subject.address,
    issuerName: parent.subjectName, subjectName: `${subject.address.slice(2, 8)}.${parent.subjectName}`, scope, nonce: randomNonce(),
  }, cfg);

const pay = (leaf: Delegation, signer: LocalAccount = settle) =>
  signRequest(signer, {
    leafId: leaf.id, audience: cfg.serviceId, action: "payment.transfer",
    amount: usd(10), target: "supplierA", nonce: randomNonce(), deadline: BigInt(NOW + 60),
  }, cfg);

/** What the service does: local checks, then revocation last. */
async function enforce(chain: Delegation[], req: ExecutionRequest, reader: RegistryReader): Promise<Verdict> {
  const local = await verifyLocal(chain, req, cfg, NOW);
  if (!local.ok) return local;
  return checkRevocation(chain, cfg, reader, NOW);
}

const revokedSet = new Set<string>();
const registry: RegistryReader = {
  read: async (issuers, ids) => ({ revoked: ids.some((id, i) => revokedSet.has(`${issuers[i]!.toLowerCase()}:${id}`)), blockTimestamp: NOW }),
};
const revoke = (issuer: LocalAccount, d: Delegation) => revokedSet.add(`${issuer.address.toLowerCase()}:${d.id}`);

let root: Delegation, d2: Delegation, d3: Delegation;
beforeAll(async () => {
  root = await signDelegation(owner, {
    v: 1, parent: ZERO_ID, issuer: owner.address, subject: ops.address,
    issuerName: "treasury.dhruv.eth", subjectName: "ops.treasury.dhruv.eth",
    scope: { actions: ["invoice.read", "payment.transfer"], maxAmount: usd(500), expiry: NOW + 24 * H, targets: ["*"] },
    nonce: randomNonce(),
  }, cfg);
  d2 = await grant(ops, procure, root, { actions: ["invoice.read", "payment.transfer"], maxAmount: usd(100), expiry: NOW + 2 * H, targets: ["supplierA", "supplierB"] });
  d3 = await grant(procure, settle, d2, { actions: ["payment.transfer"], maxAmount: usd(25), expiry: NOW + H, targets: ["supplierA"] });
});

describe("scenario 1 — valid execution", () => {
  it("settlement pays $10 to supplierA", async () => expect(await enforce([root, d2, d3], await pay(d3), registry)).toEqual({ ok: true }));
});

describe("scenario 2 — prompt-injected procurement agent", () => {
  it("genuinely signed amplification is refused with all three violations on edge 2", async () => {
    const injected = await grant(procure, settle, d2, {
      actions: ["account.manage", "payment.transfer"], maxAmount: usd(1000), expiry: NOW + H, targets: ["*"],
    });
    const v = await enforce([root, d2, injected], await pay(injected), registry);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.code).toBe("AMPLIFICATION");
    expect(v.edges).toHaveLength(1);
    expect(v.edges![0]!.edge).toBe(2);
    expect(v.edges![0]!.failures.map((f) => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
  });
});

describe("scenario 3 — ancestor revocation", () => {
  it("revoking the root refuses a previously valid request, sent with a fresh nonce", async () => {
    expect((await enforce([root, d2, d3], await pay(d3), registry)).ok).toBe(true);
    revoke(owner, root);
    const v = await enforce([root, d2, d3], await pay(d3), registry);
    expect(v).toMatchObject({ ok: false, code: "REVOKED" });
    revokedSet.clear();
  });

  it("a revocation in someone else's namespace has no effect", async () => {
    revoke(thief, root);
    expect(await enforce([root, d2, d3], await pay(d3), registry)).toEqual({ ok: true });
    revokedSet.clear();
  });
});

describe("possession", () => {
  it("a copied chain presented with a different key is refused", async () => {
    const v = await enforce([root, d2, d3], await pay(d3, thief), registry);
    expect(v).toMatchObject({ ok: false, code: "REQUEST_SIGNATURE" });
  });

  it("a thief cannot extend a copied chain to themselves", async () => {
    const extended = await grant(thief, thief, d3, d3.scope);
    const v = await enforce([root, d2, d3, extended], await pay(extended, thief), registry);
    expect(v).toMatchObject({ ok: false, code: "ISSUER_LINK" });
  });

  it("a chain rooted at someone else's treasury is refused", async () => {
    const fakeRoot = await signDelegation(thief, { ...root, issuer: thief.address, nonce: randomNonce() }, cfg);
    const fd2 = await grant(ops, procure, fakeRoot, d2.scope);
    const fd3 = await grant(procure, settle, fd2, d3.scope);
    expect(await enforce([fakeRoot, fd2, fd3], await pay(fd3), registry)).toMatchObject({ ok: false, code: "WRONG_ROOT" });
  });
});
