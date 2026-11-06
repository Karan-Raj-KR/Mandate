import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { stringToBytes } from "viem";
import type { Hex } from "viem";
import { randomNonce, signDelegation, toWire, ZERO_ID } from "@mandate/core";
import type { Delegation, Scope, VerifierConfig } from "@mandate/core";
import { fetchUnderRoot, verifyAuthority } from "../src/explore.js";
import { toRow } from "../src/publish.js";

const REGISTRY = "0x6813aa2574392530b7f1b3c5ed0683d30133fe98" as const;
const domain = { chainId: 11155111, registry: REGISTRY };
const acct = () => privateKeyToAccount(generatePrivateKey());
const [owner, ops, procure, settle] = [acct(), acct(), acct(), acct()];
const NOW = 1_800_000_000;

const cfg: VerifierConfig = {
  version: 1, chainId: domain.chainId, registry: REGISTRY, expectedRootIssuer: owner.address,
  serviceId: "payment-service", asset: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  maxDepth: 8, maxStateAgeSeconds: 60, maxRequestTtlSeconds: 300, stepUpThreshold: 15_000_000n,
};

const S = (over: Partial<Scope> = {}): Scope => ({ actions: ["payment.transfer"], maxAmount: 25_000_000n, expiry: NOW + 3600, targets: ["supplierA"], ...over });

async function link(from: typeof owner, to: typeof owner, parent: Hex, scope: Scope): Promise<Delegation> {
  return signDelegation(from, { v: 1, parent, issuer: from.address, subject: to.address, issuerName: "a.eth", subjectName: "b.eth", scope, nonce: randomNonce() }, domain);
}

async function goodChain() {
  const d1 = await link(owner, ops, ZERO_ID, S({ actions: ["invoice.read", "payment.transfer"], maxAmount: 500_000_000n, expiry: NOW + 86400, targets: ["*"] }));
  const d2 = await link(ops, procure, d1.id, S({ actions: ["invoice.read", "payment.transfer"], maxAmount: 100_000_000n, expiry: NOW + 7200, targets: ["supplierA", "supplierB"] }));
  const d3 = await link(procure, settle, d2.id, S());
  return [d1, d2, d3];
}

const none = async (_i: unknown, ids: Hex[]) => ids.map(() => false);
const status = (rows: Awaited<ReturnType<typeof verifyAuthority>>) => rows.map((r) => `${r.depth}:${r.status}`).join(" ");

describe("verifyAuthority", () => {
  it("marks a valid three hop chain usable", async () => {
    const c = await goodChain();
    const rows = await verifyAuthority(c, c[0]!.id, cfg, NOW, none);
    expect(status(rows)).toBe("0:USABLE 1:USABLE 2:USABLE");
  });

  it("denies only the amplifying hop and names the dimensions", async () => {
    const [d1, d2] = await goodChain();
    const bad = await link(procure, settle, d2!.id, S({ actions: ["account.manage", "payment.transfer"], maxAmount: 1_000_000_000n, targets: ["*"] }));
    const rows = await verifyAuthority([d1!, d2!, bad], d1!.id, cfg, NOW, none);
    expect(status(rows)).toBe("0:USABLE 1:USABLE 2:DENIED");
    const reasons = rows[2]!.reasons.join(" | ");
    for (const dim of ["actions", "maxAmount", "targets"]) expect(reasons).toContain(`edge 2 ${dim}`);
  });

  it("revoking an ancestor denies every descendant", async () => {
    const c = await goodChain();
    const rows = await verifyAuthority(c, c[0]!.id, cfg, NOW, async (_i, ids) => ids.map((id) => id === c[0]!.id));
    expect(status(rows)).toBe("0:DENIED 1:DENIED 2:DENIED");
    expect(rows[2]!.reasons).toContain("hop 0: revoked on Ethereum");
  });

  it("denies an expired hop", async () => {
    const c = await goodChain();
    const rows = await verifyAuthority(c, c[0]!.id, cfg, NOW + 4000, none); // d3 expires at NOW + 3600
    expect(status(rows)).toBe("0:USABLE 1:USABLE 2:DENIED");
    expect(rows[2]!.reasons).toContain("hop 2: expired");
  });

  it("denies a payload changed after signing", async () => {
    const c = await goodChain();
    const tampered = { ...c[2]!, scope: { ...c[2]!.scope, maxAmount: 24_000_000n } };
    const rows = await verifyAuthority([c[0]!, c[1]!, tampered], c[0]!.id, cfg, NOW, none);
    expect(rows[2]!.status).toBe("DENIED");
    expect(rows[2]!.reasons.join()).toContain("id does not match its payload");
  });

  it("denies everything when the root is not the pinned issuer", async () => {
    const c = await goodChain();
    const rows = await verifyAuthority(c, c[0]!.id, { ...cfg, expectedRootIssuer: acct().address }, NOW, none);
    expect(status(rows)).toBe("0:DENIED 1:DENIED 2:DENIED");
  });

  it("fails closed when the registry read fails", async () => {
    const c = await goodChain();
    const rows = await verifyAuthority(c, c[0]!.id, cfg, NOW, async () => {
      throw new Error("rpc down");
    });
    expect(status(rows)).toBe("0:DENIED 1:DENIED 2:DENIED");
    expect(rows[0]!.reasons.join()).toContain("could not verify: rpc down");
  });

  it("shows an unreachable delegation as denied instead of dropping it", async () => {
    const c = await goodChain();
    const orphan = await link(procure, settle, `0x${"9".repeat(64)}` as Hex, S());
    const rows = await verifyAuthority([...c, orphan], c[0]!.id, cfg, NOW, none);
    const o = rows.find((r) => r.d.id === orphan.id)!;
    expect(o.status).toBe("DENIED");
    expect(o.reasons[0]).toContain("not reachable");
  });

  it("refuses to explore a root that is not in the stored set", async () => {
    const c = await goodChain();
    await expect(verifyAuthority([c[1]!], c[0]!.id, cfg, NOW, none)).rejects.toThrow(/no root delegation/);
  });
});

describe("toRow", () => {
  it("joins actions and targets and carries the signed payload", async () => {
    const c = await goodChain();
    const row = toRow(c[1]!, c[0]!.id, 1);
    expect(row.actions).toBe("invoice.read,payment.transfer");
    expect(row.targets).toBe("supplierA,supplierB");
    expect(row.depth).toBe(1);
    expect(row.rootId).toBe(c[0]!.id);
    expect(row.maxAmount).toBe(100_000_000n);
    expect(JSON.parse(new TextDecoder().decode(row.payload)).id).toBe(c[1]!.id);
  });

  it("rejects values that do not fit an Arkiv string column", async () => {
    const d = await link(owner, ops, ZERO_ID, S({ targets: Array.from({ length: 30 }, (_, i) => `supplier-number-${String(i).padStart(3, "0")}`) }));
    expect(() => toRow(d, d.id, 0)).toThrow(/at most 128/);
  });
});

describe("fetchUnderRoot", () => {
  it("parses stored payloads, and counts garbage as unreadable instead of trusting it", async () => {
    const c = await goodChain();
    const rows = [
      { payload: { value: stringToBytes(JSON.stringify(toWire(c[0]))) } },
      { payload: { value: stringToBytes("not json") } },
      { payload: { value: stringToBytes(JSON.stringify({ hello: "world" })) } },
    ];
    const fake = { select: () => ({ from: () => ({ ownedBy: () => ({ where: () => ({ fetch: async () => ({ entities: rows }) }) }) }) }) };
    const r = await fetchUnderRoot(fake, c[0]!.id, [owner.address]);
    expect(r.delegations.map((d) => d.id)).toEqual([c[0]!.id]);
    expect(r.unreadable).toBe(2);
  });
});
