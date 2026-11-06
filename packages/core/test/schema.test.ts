import { describe, expect, it } from "vitest";
import {
  MAX_PAYLOAD_BYTES,
  parseChain,
  parseDelegation,
  parseRequest,
  toWire,
} from "../src/schema.js";
import { MAX_DEPTH } from "../src/types.js";

const ADDR_A = "0x1000000000000000000000000000000000000001";
const ADDR_B = "0x2000000000000000000000000000000000000002";
const ID = `0x${"a".repeat(64)}`;
const ZERO_ID = `0x${"0".repeat(64)}`;
const NONCE = `0x${"c".repeat(64)}`;
const SIG = `0x${"b".repeat(130)}`;

function validDelegation(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    parent: ZERO_ID,
    issuer: ADDR_A,
    subject: ADDR_B,
    issuerName: "issuer.eth",
    subjectName: "subject.eth",
    scope: {
      actions: ["invoice.read", "payment.transfer"],
      maxAmount: "100000000",
      expiry: 2000000000,
      targets: ["supplierA", "supplierB"],
    },
    nonce: NONCE,
    id: ID,
    sig: SIG,
    ...overrides,
  };
}

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    leafId: ID,
    audience: "payment-service",
    action: "payment.transfer",
    amount: "10000000",
    target: "supplierA",
    nonce: NONCE,
    deadline: "2000000000",
    sig: SIG,
    ...overrides,
  };
}

describe("parseDelegation", () => {
  it("parses a valid delegation", () => {
    const d = parseDelegation(validDelegation());
    expect(d.scope.maxAmount).toBe(100000000n);
    expect(d.issuer).toBe(ADDR_A.toLowerCase());
  });

  it("rejects an unknown action", () => {
    const bad = validDelegation();
    (bad as any).scope.actions = ["invoice.read", "admin.override"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects unsorted actions", () => {
    const bad = validDelegation();
    (bad as any).scope.actions = ["payment.transfer", "invoice.read"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects duplicate actions", () => {
    const bad = validDelegation();
    (bad as any).scope.actions = ["invoice.read", "invoice.read"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects unsorted targets", () => {
    const bad = validDelegation();
    (bad as any).scope.targets = ["supplierB", "supplierA"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects duplicate targets", () => {
    const bad = validDelegation();
    (bad as any).scope.targets = ["supplierA", "supplierA"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects targets mixing \"*\" with concrete ids", () => {
    const bad = validDelegation();
    (bad as any).scope.targets = ["*", "supplierA"];
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects a negative amount", () => {
    const bad = validDelegation();
    (bad as any).scope.maxAmount = "-5";
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects a non-integer expiry", () => {
    const bad = validDelegation();
    (bad as any).scope.expiry = 123.5;
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects a non-hex id", () => {
    const bad = validDelegation({ id: "not-hex" });
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects a non-hex sig", () => {
    const bad = validDelegation({ sig: "not-hex" });
    expect(() => parseDelegation(bad)).toThrow();
  });

  it("rejects a bad address", () => {
    const bad = validDelegation({ issuer: "0xnotanaddress" });
    expect(() => parseDelegation(bad)).toThrow();
  });
});

describe("parseChain", () => {
  it("parses a valid chain", () => {
    const chain = parseChain([validDelegation()]);
    expect(chain).toHaveLength(1);
  });

  it("rejects a chain longer than MAX_DEPTH", () => {
    const chain = Array.from({ length: MAX_DEPTH + 1 }, () => validDelegation());
    expect(() => parseChain(chain)).toThrow();
  });

  it("rejects an oversized payload", () => {
    const chain = [validDelegation({ issuerName: "x".repeat(MAX_PAYLOAD_BYTES) })];
    expect(() => parseChain(chain)).toThrow();
  });
});

describe("parseRequest", () => {
  it("parses a valid request", () => {
    const r = parseRequest(validRequest());
    expect(r.amount).toBe(10000000n);
    expect(r.deadline).toBe(2000000000n);
  });

  it("rejects a negative amount", () => {
    const bad = validRequest({ amount: "-1" });
    expect(() => parseRequest(bad)).toThrow();
  });

  it("rejects an unknown action", () => {
    const bad = validRequest({ action: "admin.override" });
    expect(() => parseRequest(bad)).toThrow();
  });

  it("rejects a non-hex nonce", () => {
    const bad = validRequest({ nonce: "not-hex" });
    expect(() => parseRequest(bad)).toThrow();
  });
});

describe("toWire", () => {
  it("turns top-level bigints into decimal strings", () => {
    expect(toWire(10n)).toBe("10");
  });

  it("turns nested bigints into strings recursively", () => {
    const wired = toWire({
      amount: 10_000_000n,
      nested: { deadline: 123n, list: [1n, { x: 2n }] },
      plain: "unchanged",
    });
    expect(wired).toEqual({
      amount: "10000000",
      nested: { deadline: "123", list: ["1", { x: "2" }] },
      plain: "unchanged",
    });
  });
});
