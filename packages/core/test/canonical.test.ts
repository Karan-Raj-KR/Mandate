import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { delegationId, delegationTypedData, requestDigest, requestTypedData } from "../src/canonical.js";
import { randomNonce, signDelegation, signRequest } from "../src/sign.js";
import { ZERO_ID, type UnsignedDelegation, type UnsignedRequest } from "../src/types.js";

const cfg: { chainId: number; registry: Address } = { chainId: 11155111, registry: "0x00000000000000000000000000000000000000aa" };
const issuer = privateKeyToAccount(generatePrivateKey());
const subject = privateKeyToAccount(generatePrivateKey());

const base: UnsignedDelegation = {
  v: 1,
  parent: ZERO_ID,
  issuer: issuer.address,
  subject: subject.address,
  issuerName: "treasury.dhruv.eth",
  subjectName: "ops.treasury.dhruv.eth",
  scope: { actions: ["invoice.read", "payment.transfer"], maxAmount: 500_000_000n, expiry: 1_800_000_000, targets: ["supplierA", "supplierB"] },
  nonce: `0x${"11".repeat(32)}`,
};

const req: UnsignedRequest = {
  leafId: `0x${"22".repeat(32)}`,
  audience: "payment-service",
  action: "payment.transfer",
  amount: 10_000_000n,
  target: "supplierA",
  nonce: `0x${"33".repeat(32)}`,
  deadline: 1_800_000_060n,
};

const id = (d: UnsignedDelegation, c = cfg) => delegationId(d, c);

describe("delegationId", () => {
  it("is deterministic", () => expect(id(base)).toBe(id(structuredClone(base))));

  const mutations: [string, UnsignedDelegation][] = [
    ["parent", { ...base, parent: `0x${"01".repeat(32)}` }],
    ["issuer", { ...base, issuer: subject.address }],
    ["subject", { ...base, subject: issuer.address }],
    ["issuerName", { ...base, issuerName: "other.eth" }],
    ["subjectName", { ...base, subjectName: "other.eth" }],
    ["nonce", { ...base, nonce: `0x${"12".repeat(32)}` }],
    ["scope.actions", { ...base, scope: { ...base.scope, actions: ["payment.transfer"] } }],
    ["scope.maxAmount", { ...base, scope: { ...base.scope, maxAmount: 500_000_001n } }],
    ["scope.expiry", { ...base, scope: { ...base.scope, expiry: 1_800_000_001 } }],
    ["scope.targets", { ...base, scope: { ...base.scope, targets: ["supplierA"] } }],
  ];
  it.each(mutations)("changes when %s changes", (_name, mutated) => expect(id(mutated)).not.toBe(id(base)));

  it('does not collide ["a,b"] with ["a","b"]', () => {
    const joined = { ...base, scope: { ...base.scope, targets: ["a,b"] } };
    const split = { ...base, scope: { ...base.scope, targets: ["a", "b"] } };
    expect(id(joined)).not.toBe(id(split));
  });

  it("changes with chainId", () => expect(id(base, { ...cfg, chainId: 1 })).not.toBe(id(base)));
  it("changes with registry", () =>
    expect(id(base, { ...cfg, registry: "0x00000000000000000000000000000000000000bb" })).not.toBe(id(base)));
});

describe("requestDigest", () => {
  const digest = (r: UnsignedRequest) => requestDigest(r, cfg);
  it("is deterministic", () => expect(digest(req)).toBe(digest({ ...req })));

  const mutations: [string, UnsignedRequest][] = [
    ["audience", { ...req, audience: "other-service" }],
    ["amount", { ...req, amount: 10_000_001n }],
    ["target", { ...req, target: "supplierB" }],
    ["deadline", { ...req, deadline: 1_800_000_061n }],
    ["nonce", { ...req, nonce: `0x${"34".repeat(32)}` }],
    ["leafId", { ...req, leafId: `0x${"23".repeat(32)}` }],
    ["action", { ...req, action: "invoice.read" }],
  ];
  it.each(mutations)("changes when %s changes", (_name, mutated) => expect(digest(mutated)).not.toBe(digest(req)));
});

describe("signing", () => {
  it("signDelegation sets id and a signature recoverable to the issuer", async () => {
    const d = await signDelegation(issuer, base, cfg);
    expect(d.id).toBe(id(base));
    expect(await recoverTypedDataAddress({ ...delegationTypedData(base, cfg), signature: d.sig })).toBe(issuer.address);
  });

  it("signDelegation throws when the account is not the issuer", async () =>
    expect(signDelegation(subject, base, cfg)).rejects.toThrow(/not the delegation issuer/));

  it("signRequest produces a signature recoverable to the signer", async () => {
    const r = await signRequest(subject, req, cfg);
    expect(await recoverTypedDataAddress({ ...requestTypedData(req, cfg), signature: r.sig })).toBe(subject.address);
  });

  it("randomNonce is 32 bytes and unique", () => {
    const a = randomNonce();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(randomNonce()).not.toBe(a);
  });
});
