import { describe, expect, it } from "vitest";
import { checkAllEdges, narrows } from "../src/narrow.js";
import type { Delegation, Scope } from "../src/types.js";

const NOW = Math.floor(Date.now() / 1000);
const USDC = (n: number) => BigInt(n) * 1_000_000n;

function scope(overrides: Partial<Scope> = {}): Scope {
  return {
    actions: ["invoice.read", "payment.transfer"],
    maxAmount: USDC(100),
    expiry: NOW + 3600,
    targets: ["supplierA", "supplierB"],
    ...overrides,
  };
}

let nonce = 0;
function hex(byte: string, len = 64): `0x${string}` {
  return `0x${byte.repeat(len)}` as `0x${string}`;
}

function makeDelegation(s: Scope, parent: `0x${string}` = hex("0")): Delegation {
  nonce += 1;
  return {
    v: 1,
    parent,
    issuer: "0x1000000000000000000000000000000000000001",
    subject: "0x2000000000000000000000000000000000000002",
    issuerName: "issuer.eth",
    subjectName: "subject.eth",
    scope: s,
    nonce: hex(nonce.toString(16).padStart(2, "0"), 32),
    id: hex("a"),
    sig: hex("b", 130),
  };
}

describe("narrows", () => {
  it("identical scopes produce no failures", () => {
    const s = scope();
    expect(narrows(s, s)).toEqual([]);
  });

  it("a strictly narrower child passes", () => {
    const parent = scope();
    const child = scope({
      actions: ["payment.transfer"],
      maxAmount: USDC(10),
      expiry: NOW + 60,
      targets: ["supplierA"],
    });
    expect(narrows(child, parent)).toEqual([]);
  });

  it("an extra action fails", () => {
    const parent = scope();
    const child = scope({ actions: ["invoice.read", "payment.transfer", "account.manage"] });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(1);
    expect(failures[0].dimension).toBe("actions");
  });

  it("maxAmount +1 fails", () => {
    const parent = scope();
    const child = scope({ maxAmount: parent.maxAmount + 1n });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(1);
    expect(failures[0].dimension).toBe("maxAmount");
  });

  it("expiry +1s fails", () => {
    const parent = scope();
    const child = scope({ expiry: parent.expiry + 1 });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(1);
    expect(failures[0].dimension).toBe("expiry");
  });

  it("an added target fails", () => {
    const parent = scope({ targets: ["supplierA"] });
    const child = scope({ targets: ["supplierA", "supplierB"] });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(1);
    expect(failures[0].dimension).toBe("targets");
  });

  it("child '*' from a restricted parent fails", () => {
    const parent = scope({ targets: ["supplierA"] });
    const child = scope({ targets: ["*"] });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(1);
    expect(failures[0].dimension).toBe("targets");
  });

  it("restricted child from a '*' parent passes", () => {
    const parent = scope({ targets: ["*"] });
    const child = scope({ targets: ["supplierA"] });
    expect(narrows(child, parent)).toEqual([]);
  });

  it("empty child actions pass", () => {
    const parent = scope();
    const child = scope({ actions: [] });
    expect(narrows(child, parent)).toEqual([]);
  });

  it("amplification across three dimensions returns exactly three failures", () => {
    const parent = scope({
      actions: ["invoice.read", "payment.transfer"],
      maxAmount: USDC(100),
      targets: ["supplierA", "supplierB"],
    });
    const child = scope({
      actions: ["invoice.read", "payment.transfer", "account.manage"],
      maxAmount: USDC(1000),
      targets: ["*"],
    });
    const failures = narrows(child, parent);
    expect(failures).toHaveLength(3);
    expect(failures.map(f => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
  });
});

describe("checkAllEdges", () => {
  it("the demo chain (SPEC §9) passes both edges", () => {
    const ownerToOps = makeDelegation(
      scope({
        actions: ["invoice.read", "payment.transfer"],
        maxAmount: USDC(500),
        expiry: NOW + 24 * 3600,
        targets: ["*"],
      }),
    );
    const opsToProcure = makeDelegation(
      scope({
        actions: ["invoice.read", "payment.transfer"],
        maxAmount: USDC(100),
        expiry: NOW + 2 * 3600,
        targets: ["supplierA", "supplierB"],
      }),
      ownerToOps.id,
    );
    const procureToSettle = makeDelegation(
      scope({
        actions: ["payment.transfer"],
        maxAmount: USDC(25),
        expiry: NOW + 3600,
        targets: ["supplierA"],
      }),
      opsToProcure.id,
    );

    expect(checkAllEdges([ownerToOps, opsToProcure, procureToSettle])).toEqual([]);
  });

  it("the demo attack fails with actions + maxAmount + targets on the amplified edge", () => {
    const ownerToOps = makeDelegation(
      scope({
        actions: ["invoice.read", "payment.transfer"],
        maxAmount: USDC(500),
        expiry: NOW + 24 * 3600,
        targets: ["*"],
      }),
    );
    const opsToProcure = makeDelegation(
      scope({
        actions: ["invoice.read", "payment.transfer"],
        maxAmount: USDC(100),
        expiry: NOW + 2 * 3600,
        targets: ["supplierA", "supplierB"],
      }),
      ownerToOps.id,
    );
    const amplifiedProcureToSettle = makeDelegation(
      scope({
        actions: ["payment.transfer", "account.manage"],
        maxAmount: USDC(1000),
        expiry: NOW + 3600,
        targets: ["*"],
      }),
      opsToProcure.id,
    );

    const edges = checkAllEdges([ownerToOps, opsToProcure, amplifiedProcureToSettle]);
    expect(edges).toHaveLength(1);
    expect(edges[0].edge).toBe(2);
    expect(edges[0].failures.map(f => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
  });
});
