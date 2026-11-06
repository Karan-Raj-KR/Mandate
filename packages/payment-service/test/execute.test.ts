import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import type { Verdict, VerifierConfig } from "@mandate/core";
import { createApp } from "../src/app.js";
import { createNonceStore } from "../src/nonces.js";

const ADDR_A = "0x1000000000000000000000000000000000000001";
const ADDR_B = "0x2000000000000000000000000000000000000002";
const ASSET = "0x3000000000000000000000000000000000000003";
const SUPPLIER_A_ADDRESS = "0x4000000000000000000000000000000000000004" as Address;
const ID = `0x${"a".repeat(64)}`;
const ZERO_ID = `0x${"0".repeat(64)}`;
const SIG = `0x${"b".repeat(130)}`;

function nonceHex(n: number): Hex {
  return `0x${n.toString(16).padStart(64, "0")}` as Hex;
}

function validDelegation(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    parent: ZERO_ID,
    issuer: ADDR_A,
    subject: ADDR_B,
    issuerName: "issuer.eth",
    subjectName: "subject.eth",
    scope: {
      actions: ["payment.transfer"],
      maxAmount: "100000000",
      expiry: 2000000000,
      targets: ["supplierA"],
    },
    nonce: nonceHex(1),
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
    nonce: nonceHex(2),
    deadline: "2000000000",
    sig: SIG,
    ...overrides,
  };
}

const cfg: VerifierConfig = {
  version: 1,
  chainId: 11155111,
  registry: "0x5000000000000000000000000000000000000005",
  expectedRootIssuer: ADDR_A,
  serviceId: "payment-service",
  asset: ASSET,
  maxDepth: 8,
  maxStateAgeSeconds: 60,
  maxRequestTtlSeconds: 300,
  stepUpThreshold: 15_000_000n,
};

const OK_VERDICT: Verdict = { ok: true };

function buildApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  const transfer = vi.fn(async () => "0xdeadbeef" as Hex);
  const verifyLocal = vi.fn(async () => OK_VERDICT);
  const checkRevocation = vi.fn(async () => OK_VERDICT);
  const resolveTarget = vi.fn((target: string) =>
    target === "supplierA" ? SUPPLIER_A_ADDRESS : null,
  );
  const getBalance = vi.fn(async () => 1_000_000_000n);

  const app = createApp({
    cfg,
    verifyLocal,
    checkRevocation,
    reader: { read: async () => ({ revoked: false, blockTimestamp: Math.floor(Date.now() / 1000) }) },
    transfer,
    getBalance,
    resolveTarget,
    nonceStore: createNonceStore(),
    simulated: true,
    ...overrides,
  });

  return { app, transfer, verifyLocal, checkRevocation, resolveTarget, getBalance };
}

describe("POST /execute", () => {
  it("pays out on a valid chain and request", async () => {
    const { app, transfer } = buildApp();
    const res = await request(app)
      .post("/execute")
      .send({ chain: [validDelegation()], request: validRequest() });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.txHash).toBe("0xdeadbeef");
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer).toHaveBeenCalledWith(SUPPLIER_A_ADDRESS, 10_000_000n);
  });

  it("produces no transfer on amplification", async () => {
    const verdict: Verdict = {
      ok: false,
      code: "AMPLIFICATION",
      detail: "scope widened",
      edges: [{ edge: 1, failures: [] }],
    };
    const { app, transfer } = buildApp({ verifyLocal: vi.fn(async () => verdict) });

    const res = await request(app)
      .post("/execute")
      .send({ chain: [validDelegation()], request: validRequest() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AMPLIFICATION");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("produces no transfer on revocation", async () => {
    const verdict: Verdict = { ok: false, code: "REVOKED", detail: "ancestor revoked" };
    const { app, transfer } = buildApp({ checkRevocation: vi.fn(async () => verdict) });

    const res = await request(app)
      .post("/execute")
      .send({ chain: [validDelegation()], request: validRequest() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REVOKED");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("produces no transfer on replay", async () => {
    const { app, transfer } = buildApp();
    const body = { chain: [validDelegation()], request: validRequest() };

    const first = await request(app).post("/execute").send(body);
    const second = await request(app).post("/execute").send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("REPLAY");
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it("produces no transfer on wrong audience", async () => {
    const verdict: Verdict = { ok: false, code: "AUDIENCE", detail: "wrong service" };
    const { app, transfer } = buildApp({ verifyLocal: vi.fn(async () => verdict) });

    const res = await request(app)
      .post("/execute")
      .send({ chain: [validDelegation()], request: validRequest() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AUDIENCE");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("produces no transfer when the registry is unavailable", async () => {
    const verdict: Verdict = { ok: false, code: "REGISTRY_UNAVAILABLE", detail: "rpc down" };
    const { app, transfer } = buildApp({ checkRevocation: vi.fn(async () => verdict) });

    const res = await request(app)
      .post("/execute")
      .send({ chain: [validDelegation()], request: validRequest() });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("REGISTRY_UNAVAILABLE");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("lets exactly one of two concurrent requests with the same nonce reach transfer", async () => {
    const { app, transfer } = buildApp();
    const body = { chain: [validDelegation()], request: validRequest() };

    const [first, second] = await Promise.all([
      request(app).post("/execute").send(body),
      request(app).post("/execute").send(body),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 403]);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it("requires step-up above the threshold without consuming the nonce or calling transfer", async () => {
    const { app, transfer, verifyLocal } = buildApp();
    const nonce = nonceHex(99);

    const stepUp = await request(app)
      .post("/execute")
      .send({
        chain: [validDelegation()],
        request: validRequest({ amount: "20000000", nonce }),
      });

    expect(stepUp.status).toBe(403);
    expect(stepUp.body.code).toBe("STEP_UP_REQUIRED");
    expect(transfer).not.toHaveBeenCalled();
    expect(verifyLocal).toHaveBeenCalledTimes(1);

    const retryWithSameNonce = await request(app)
      .post("/execute")
      .send({
        chain: [validDelegation()],
        request: validRequest({ amount: "10000000", nonce }),
      });

    expect(retryWithSameNonce.status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown target", async () => {
    const { app, transfer } = buildApp();
    const res = await request(app)
      .post("/execute")
      .send({
        chain: [validDelegation()],
        request: validRequest({ target: "unknownSupplier" }),
      });

    expect(res.status).toBe(400);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with SCHEMA", async () => {
    const { app, transfer } = buildApp();
    const res = await request(app)
      .post("/execute")
      .send({ chain: "not-a-chain", request: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SCHEMA");
    expect(transfer).not.toHaveBeenCalled();
  });
});

describe("GET /balance", () => {
  it("returns the service wallet balance as a string", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/balance");

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe("1000000000");
    expect(res.body.simulated).toBe(true);
  });
});
