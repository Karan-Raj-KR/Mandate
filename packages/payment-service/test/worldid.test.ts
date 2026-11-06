import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { parseRequest } from "@mandate/core";
import type { VerifierConfig } from "@mandate/core";
import { createApp } from "../src/app.js";
import { createNonceStore } from "../src/nonces.js";
import { approvalSignal, createRpContextSigner, createWorldVerifier } from "../src/worldid.js";

const A = "0x1000000000000000000000000000000000000001";
const B = "0x2000000000000000000000000000000000000002";
const ID = `0x${"a".repeat(64)}`;
const ZERO = `0x${"0".repeat(64)}`;
const SIG = `0x${"b".repeat(130)}`;
const nonce = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const cfg: VerifierConfig = {
  version: 1, chainId: 11155111, registry: "0x5000000000000000000000000000000000000005", expectedRootIssuer: A,
  serviceId: "payment-service", asset: "0x3000000000000000000000000000000000000003",
  maxDepth: 8, maxStateAgeSeconds: 60, maxRequestTtlSeconds: 300, stepUpThreshold: 15_000_000n,
};

const chain = [{
  v: 1, parent: ZERO, issuer: A, subject: B, issuerName: "a.eth", subjectName: "b.eth",
  scope: { actions: ["payment.transfer"], maxAmount: "100000000", expiry: 2000000000, targets: ["supplierA"] },
  nonce: nonce(1), id: ID, sig: SIG,
}];
const req = (n: number, amount = "20000000") => ({
  leafId: ID, audience: "payment-service", action: "payment.transfer", amount, target: "supplierA",
  nonce: nonce(n), deadline: "2000000000", sig: SIG,
});
const signalOf = (r: ReturnType<typeof req>) => approvalSignal(parseRequest(r), cfg);

const proof = (signal: Hex, over: Record<string, unknown> = {}) => ({
  protocol_version: "4.0", nonce: `n-${Math.random()}`, action: "approve-payment", environment: "production",
  responses: [{ identifier: "proof_of_human", signal_hash: hashSignal(signal), proof: ["0x1"], nullifier: "0x2" }],
  ...over,
});
const worldOk = (env = "production") => vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, environment: env }) } as Response);
const verifier = (fetchImpl: any, environment: "production" | "staging" = "production") => createWorldVerifier({ rpId: "rp_test", environment, fetchImpl });

describe("approvalSignal", () => {
  it("changes when any field of the request changes", () => {
    const base = signalOf(req(2));
    expect(signalOf(req(2))).toBe(base);
    expect(signalOf(req(3))).not.toBe(base); // nonce
    expect(signalOf(req(2, "20000001"))).not.toBe(base); // amount
    expect(signalOf({ ...req(2), target: "supplierB" })).not.toBe(base); // target
  });
});

describe("createWorldVerifier", () => {
  const sig = signalOf(req(2));

  it("accepts a proof bound to the request and forwards it as-is to the verify endpoint", async () => {
    const f = worldOk();
    const p = proof(sig);
    expect(await verifier(f)(p, sig)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0]![0]).toBe("https://developer.world.org/api/v4/verify/rp_test");
    expect(JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string)).toEqual(p);
  });

  it("refuses a proof made for a different request, without calling World", async () => {
    const f = worldOk();
    const r = await verifier(f)(proof(signalOf(req(9))), sig);
    expect(r).toMatchObject({ ok: false, detail: expect.stringContaining("exact request") });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses when any one response is bound to something else", async () => {
    const p = proof(sig);
    (p.responses as any[]).push({ ...(p.responses[0] as object), signal_hash: hashSignal("something else") });
    expect((await verifier(worldOk())(p, sig)).ok).toBe(false);
  });

  it("refuses a staging proof in production, and a production proof in staging", async () => {
    expect((await verifier(worldOk())(proof(sig, { environment: "staging" }), sig)).ok).toBe(false);
    expect((await verifier(worldOk("staging"), "staging")(proof(sig, { environment: "production" }), sig)).ok).toBe(false);
    expect(await verifier(worldOk("staging"), "staging")(proof(sig, { environment: "staging" }), sig)).toEqual({ ok: true });
  });

  it("refuses a missing, empty or malformed proof", async () => {
    for (const bad of [undefined, null, "x", [], {}, { environment: "production" }, proof(sig, { responses: [] }), proof(sig, { nonce: "" }), proof(sig, { nonce: undefined })]) {
      expect((await verifier(worldOk())(bad, sig)).ok).toBe(false);
    }
  });

  it("refuses an oversized proof", async () => {
    expect((await verifier(worldOk())(proof(sig, { junk: "x".repeat(40_000) }), sig)).ok).toBe(false);
  });

  it("accepts each proof only once, even when verification failed", async () => {
    const v = verifier(vi.fn().mockResolvedValue({ status: 400, json: async () => ({}) } as Response));
    const p = proof(sig);
    expect((await v(p, sig)).ok).toBe(false); // burned by the failed attempt
    const second = await v(p, sig);
    expect(second).toMatchObject({ ok: false, detail: expect.stringContaining("already used") });
  });

  it("fails closed on HTTP errors, success:false, a wrong environment in the reply, and network errors", async () => {
    const cases = [
      vi.fn().mockResolvedValue({ status: 500, json: async () => ({}) } as Response),
      vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: false, environment: "production" }) } as Response),
      vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, environment: "staging" }) } as Response),
      vi.fn().mockResolvedValue({ status: 200, json: async () => ({ environment: "production" }) } as Response),
      vi.fn().mockRejectedValue(new Error("network down")),
    ];
    for (const f of cases) expect((await verifier(f)(proof(sig), sig)).ok).toBe(false);
  });

  it("lets exactly one of two concurrent uses of the same proof through", async () => {
    const v = verifier(worldOk());
    const p = proof(sig);
    const results = await Promise.all([v(p, sig), v(p, sig)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("POST /execute with World ID step-up", () => {
  function build(over: Partial<Parameters<typeof createApp>[0]> = {}) {
    const transfer = vi.fn(async () => "0xdeadbeef" as Hex);
    const app = createApp({
      cfg,
      verifyLocal: async () => ({ ok: true }),
      checkRevocation: async () => ({ ok: true }),
      reader: { read: async () => ({ revoked: false, blockTimestamp: 0 }) },
      transfer,
      getBalance: async () => 1n,
      resolveTarget: (t) => (t === "supplierA" ? ("0x4000000000000000000000000000000000000004" as Address) : null),
      nonceStore: createNonceStore(),
      simulated: true,
      approvalVerifier: verifier(worldOk()),
      ...over,
    });
    return { app, transfer };
  }

  it("executes an above-threshold payment that carries a proof bound to it", async () => {
    const { app, transfer } = build();
    const r = req(5);
    const res = await request(app).post("/execute").send({ chain, request: r, worldProof: proof(signalOf(r)) });
    expect(res.status).toBe(200);
    expect(transfer).toHaveBeenCalledOnce();
  });

  it("denies one with no proof, or a proof for another request, with no side effect and the nonce unspent", async () => {
    const { app, transfer } = build();
    const r = req(6);
    const none = await request(app).post("/execute").send({ chain, request: r });
    expect(none.status).toBe(403);
    expect(none.body.code).toBe("STEP_UP_REQUIRED");
    const wrong = await request(app).post("/execute").send({ chain, request: r, worldProof: proof(signalOf(req(99))) });
    expect(wrong.status).toBe(403);
    expect(wrong.body.detail).toContain("exact request");
    expect(transfer).not.toHaveBeenCalled();
    // the nonce was never consumed, so the same request can still go through with a correct approval
    const ok = await request(app).post("/execute").send({ chain, request: r, worldProof: proof(signalOf(r)) });
    expect(ok.status).toBe(200);
  });

  it("denies every above-threshold request when World ID is not configured, even with a proof", async () => {
    const { app, transfer } = build({ approvalVerifier: undefined });
    const r = req(7);
    const res = await request(app).post("/execute").send({ chain, request: r, worldProof: proof(signalOf(r)) });
    expect(res.status).toBe(403);
    expect(transfer).not.toHaveBeenCalled();
  });

  it("does not ask for approval at or below the threshold", async () => {
    const f = worldOk();
    const { app, transfer } = build({ approvalVerifier: verifier(f) });
    const res = await request(app).post("/execute").send({ chain, request: req(8, "15000000") });
    expect(res.status).toBe(200);
    expect(f).not.toHaveBeenCalled();
    expect(transfer).toHaveBeenCalledOnce();
  });
});

describe("POST /world/context", () => {
  it("is disabled when not configured", async () => {
    const { app } = { app: createApp({ cfg, verifyLocal: async () => ({ ok: true }), checkRevocation: async () => ({ ok: true }), reader: { read: async () => ({ revoked: false, blockTimestamp: 0 }) }, transfer: async () => "0x" as Hex, getBalance: async () => 0n, resolveTarget: () => null, nonceStore: createNonceStore(), simulated: true }) };
    expect((await request(app).post("/world/context").send({ request: req(1) })).status).toBe(503);
  });

  it("returns the signal for the request plus a signed rp_context, and never the signing key", async () => {
    const signingKeyHex = "0x" + "11".repeat(32);
    const worldContext = createRpContextSigner({ signingKeyHex, action: "approve-payment", rpId: "rp_test" });
    const app = createApp({ cfg, verifyLocal: async () => ({ ok: true }), checkRevocation: async () => ({ ok: true }), reader: { read: async () => ({ revoked: false, blockTimestamp: 0 }) }, transfer: async () => "0x" as Hex, getBalance: async () => 0n, resolveTarget: () => null, nonceStore: createNonceStore(), simulated: true, worldContext });
    const r = req(1);
    const res = await request(app).post("/world/context").send({ request: r });
    expect(res.status).toBe(200);
    expect(res.body.signal).toBe(signalOf(r));
    expect(res.body.rp_context).toMatchObject({ rp_id: "rp_test" });
    expect(res.body.rp_context.signature).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain(signingKeyHex.slice(2));
    expect((await request(app).post("/world/context").send({ request: { nope: 1 } })).status).toBe(400);
  });
});
