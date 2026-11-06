import { createPublicClient, createWalletClient, http, type Hex, type LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { beforeAll, describe, expect, it } from "vitest";
import { makeRegistryReader, registryAbi, type RegistryReader } from "../src/registry.js";
import { randomNonce, signDelegation, signRequest } from "../src/sign.js";
import { ZERO_ID, type Delegation, type Scope, type VerifierConfig } from "../src/types.js";
import { checkRevocation, verifyLocal } from "../src/verify.js";

const NOW = 1_800_000_000;
const H = 3600;
const usd = (n: number) => BigInt(n) * 1_000_000n;

const owner = privateKeyToAccount(generatePrivateKey());
const ops = privateKeyToAccount(generatePrivateKey());
const procure = privateKeyToAccount(generatePrivateKey());
const settle = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

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

const grant = (issuer: LocalAccount, subject: LocalAccount, parent: Delegation | null, scope: Scope, names: [string, string]) =>
  signDelegation(issuer, {
    v: 1, parent: parent?.id ?? ZERO_ID, issuer: issuer.address, subject: subject.address,
    issuerName: names[0], subjectName: names[1], scope, nonce: randomNonce(),
  }, cfg);

let chain: Delegation[];
beforeAll(async () => {
  const d1 = await grant(owner, ops, null,
    { actions: ["invoice.read", "payment.transfer"], maxAmount: usd(500), expiry: NOW + 24 * H, targets: ["*"] },
    ["treasury.dhruv.eth", "ops.treasury.dhruv.eth"]);
  const d2 = await grant(ops, procure, d1,
    { actions: ["invoice.read", "payment.transfer"], maxAmount: usd(100), expiry: NOW + 2 * H, targets: ["supplierA", "supplierB"] },
    ["ops.treasury.dhruv.eth", "procure.ops.treasury.dhruv.eth"]);
  const d3 = await grant(procure, settle, d2,
    { actions: ["payment.transfer"], maxAmount: usd(25), expiry: NOW + H, targets: ["supplierA"] },
    ["procure.ops.treasury.dhruv.eth", "settle.procure.ops.treasury.dhruv.eth"]);
  chain = [d1, d2, d3];
});

const leaf = () => chain[chain.length - 1]!;
const pay = (o: { amount?: bigint; target?: string; signer?: LocalAccount; deadline?: bigint; audience?: string } = {}) =>
  signRequest(o.signer ?? settle, {
    leafId: leaf().id, audience: o.audience ?? cfg.serviceId, action: "payment.transfer",
    amount: o.amount ?? usd(10), target: o.target ?? "supplierA", nonce: randomNonce(), deadline: o.deadline ?? BigInt(NOW + 60),
  }, cfg);
const code = async (p: Promise<{ ok: boolean; code?: string }>) => {
  const v = await p;
  return v.ok ? "OK" : (v as { code: string }).code;
};

describe("verifyLocal — chain", () => {
  it("valid chain passes", async () => expect(await verifyLocal(chain, await pay(), cfg, NOW)).toEqual({ ok: true }));
  it("empty chain", async () => expect(await code(verifyLocal([], await pay(), cfg, NOW))).toBe("EMPTY_CHAIN"));
  it("too deep", async () => expect(await code(verifyLocal(chain, await pay(), { ...cfg, maxDepth: 2 }, NOW))).toBe("TOO_DEEP"));
  it("not a root", async () => expect(await code(verifyLocal(chain.slice(1), await pay(), cfg, NOW))).toBe("NOT_ROOT"));
  it("second root in the middle", async () =>
    expect(await code(verifyLocal([chain[0]!, chain[0]!, leaf()], await pay(), cfg, NOW))).toBe("PARENT_LINK"));
  it("wrong expected root", async () =>
    expect(await code(verifyLocal(chain, await pay(), { ...cfg, expectedRootIssuer: stranger.address }, NOW))).toBe("WRONG_ROOT"));
  it("root issuer compared case-insensitively", async () =>
    expect(await code(verifyLocal(chain, await pay(), { ...cfg, expectedRootIssuer: owner.address.toLowerCase() as Hex }, NOW))).toBe("OK"));
  it("wrong chainId in cfg", async () => expect(await code(verifyLocal(chain, await pay(), { ...cfg, chainId: 1 }, NOW))).toBe("ID_MISMATCH"));
  it("wrong registry in cfg", async () =>
    expect(await code(verifyLocal(chain, await pay(), { ...cfg, registry: "0x00000000000000000000000000000000000000bb" }, NOW))).toBe("ID_MISMATCH"));
  it("mutated payload (maxAmount raised after signing)", async () => {
    const bad = [chain[0]!, { ...chain[1]!, scope: { ...chain[1]!.scope, maxAmount: usd(400) } }, leaf()];
    expect(await code(verifyLocal(bad, await pay(), cfg, NOW))).toBe("ID_MISMATCH");
  });
  it("bad signature (signed by the wrong key)", async () => {
    const forged = { ...chain[1]!, sig: await stranger.signMessage({ message: "x" }) };
    expect(await code(verifyLocal([chain[0]!, forged, leaf()], await pay(), cfg, NOW))).toBe("BAD_SIGNATURE");
  });
  it("broken parent link", async () => {
    const orphan = await grant(procure, settle, chain[0]!, leaf().scope, ["procure.ops.treasury.dhruv.eth", "settle.procure.ops.treasury.dhruv.eth"]);
    const req = await signRequest(settle, { ...(await pay()), leafId: orphan.id }, cfg);
    expect(await code(verifyLocal([chain[0]!, chain[1]!, orphan], req, cfg, NOW))).toBe("PARENT_LINK");
  });
  it("rogue issuer (issuer is not the parent's subject)", async () => {
    const rogue = await grant(stranger, settle, chain[1]!, leaf().scope, ["rogue.eth", "settle.procure.ops.treasury.dhruv.eth"]);
    const req = await signRequest(settle, { ...(await pay()), leafId: rogue.id }, cfg);
    expect(await code(verifyLocal([chain[0]!, chain[1]!, rogue], req, cfg, NOW))).toBe("ISSUER_LINK");
  });
  it("expired ancestor", async () => expect(await code(verifyLocal(chain, await pay({ deadline: BigInt(NOW + 2 * H + 60) }), cfg, NOW + 2 * H))).toBe("EXPIRED"));
  it("expiry boundary: now == expiry is expired", async () =>
    expect(await code(verifyLocal(chain, await pay({ deadline: BigInt(NOW + H + 60) }), cfg, NOW + H))).toBe("EXPIRED"));
});

describe("verifyLocal — request", () => {
  it("deadline in the past", async () => expect(await code(verifyLocal(chain, await pay({ deadline: BigInt(NOW) }), cfg, NOW))).toBe("DEADLINE"));
  it("deadline too far out", async () =>
    expect(await code(verifyLocal(chain, await pay({ deadline: BigInt(NOW + 301) }), cfg, NOW))).toBe("DEADLINE"));
  it("wrong audience", async () => expect(await code(verifyLocal(chain, await pay({ audience: "other-service" }), cfg, NOW))).toBe("AUDIENCE"));
  it("leafId not the final delegation", async () => {
    const req = await signRequest(settle, { ...(await pay()), leafId: chain[1]!.id }, cfg);
    expect(await code(verifyLocal(chain, req, cfg, NOW))).toBe("REQUEST_SIGNATURE");
  });
  it("wrong final-agent key on request", async () =>
    expect(await code(verifyLocal(chain, await pay({ signer: stranger }), cfg, NOW))).toBe("REQUEST_SIGNATURE"));
  it("amount changed after signing", async () =>
    expect(await code(verifyLocal(chain, { ...(await pay()), amount: usd(20) }, cfg, NOW))).toBe("REQUEST_SIGNATURE"));
  it("target changed after signing", async () =>
    expect(await code(verifyLocal(chain, { ...(await pay()), target: "supplierB" }, cfg, NOW))).toBe("REQUEST_SIGNATURE"));
  it("amount over the leaf ceiling", async () => expect(await code(verifyLocal(chain, await pay({ amount: usd(26) }), cfg, NOW))).toBe("OUT_OF_SCOPE"));
  it("amount equal to the ceiling is allowed", async () => expect(await code(verifyLocal(chain, await pay({ amount: usd(25) }), cfg, NOW))).toBe("OK"));
  it("target not granted", async () => expect(await code(verifyLocal(chain, await pay({ target: "supplierB" }), cfg, NOW))).toBe("OUT_OF_SCOPE"));
  it("action not granted", async () => {
    const req = await signRequest(settle, { ...(await pay()), action: "invoice.read" }, cfg);
    expect(await code(verifyLocal(chain, req, cfg, NOW))).toBe("OUT_OF_SCOPE");
  });
  it("garbage input denies instead of throwing", async () =>
    expect((await verifyLocal([{ ...leaf(), parent: ZERO_ID, issuer: "nope" as Hex }], await pay(), cfg, NOW)).ok).toBe(false));
});

const reader = (revokedIds: Set<string>, blockTimestamp = NOW): RegistryReader => ({
  read: async (_issuers, ids) => ({ revoked: ids.some((id) => revokedIds.has(id)), blockTimestamp }),
});

describe("checkRevocation", () => {
  it("passes when nothing is revoked", async () => expect(await checkRevocation(chain, cfg, reader(new Set()), NOW)).toEqual({ ok: true }));
  it("revoked root → REVOKED", async () => expect(await code(checkRevocation(chain, cfg, reader(new Set([chain[0]!.id])), NOW))).toBe("REVOKED"));
  it("revoked intermediate → REVOKED", async () => expect(await code(checkRevocation(chain, cfg, reader(new Set([chain[1]!.id])), NOW))).toBe("REVOKED"));
  it("reader throws → REGISTRY_UNAVAILABLE", async () =>
    expect(await code(checkRevocation(chain, cfg, { read: async () => { throw new Error("rpc down"); } }, NOW))).toBe("REGISTRY_UNAVAILABLE"));
  it("reader returns garbage → REGISTRY_UNAVAILABLE", async () =>
    expect(await code(checkRevocation(chain, cfg, { read: async () => ({ revoked: "no" as unknown as boolean, blockTimestamp: NOW }) }, NOW))).toBe("REGISTRY_UNAVAILABLE"));
  it("old blockTimestamp → STALE_STATE", async () =>
    expect(await code(checkRevocation(chain, cfg, reader(new Set(), NOW - 61), NOW))).toBe("STALE_STATE"));
  it("passes the chain's issuers and ids in order", async () => {
    let seen: [string[], string[]] = [[], []];
    await checkRevocation(chain, cfg, { read: async (i, ids) => { seen = [i, ids]; return { revoked: false, blockTimestamp: NOW }; } }, NOW);
    expect(seen).toEqual([chain.map((d) => d.issuer), chain.map((d) => d.id)]);
  });
});

const live = process.env.SEPOLIA_RPC_URL && process.env.REGISTRY_ADDRESS && process.env.LIVE_TEST_PK;
describe.skipIf(!live)("live registry on Sepolia", () => {
  it("revoke then read returns revoked: true", async () => {
    const transport = http(process.env.SEPOLIA_RPC_URL);
    const account = privateKeyToAccount(process.env.LIVE_TEST_PK as Hex);
    const registry = process.env.REGISTRY_ADDRESS as Hex;
    const publicClient = createPublicClient({ chain: sepolia, transport });
    const wallet = createWalletClient({ chain: sepolia, transport, account });
    const id = randomNonce();
    const hash = await wallet.writeContract({ address: registry, abi: registryAbi, functionName: "revoke", args: [id] });
    await publicClient.waitForTransactionReceipt({ hash });
    const r = await makeRegistryReader(publicClient, { registry }).read([account.address], [id]);
    expect(r.revoked).toBe(true);
  }, 120_000);
});
