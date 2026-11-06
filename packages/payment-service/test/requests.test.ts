import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import type { Verdict, VerifierConfig } from "@mandate/core";
import { createApp } from "../src/app.js";
import { createNonceStore } from "../src/nonces.js";
import { createRunStore } from "../src/requests.js";

const A = "0x1000000000000000000000000000000000000001";
const B = "0x2000000000000000000000000000000000000002";
const ID = `0x${"a".repeat(64)}`;
const ZERO = `0x${"0".repeat(64)}`;
const SIG = `0x${"b".repeat(130)}`;
const nonce = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const chain = [
  {
    v: 1, parent: ZERO, issuer: A, subject: B, issuerName: "a.eth", subjectName: "b.eth",
    scope: { actions: ["payment.transfer"], maxAmount: "100000000", expiry: 2000000000, targets: ["supplierA"] },
    nonce: nonce(1), id: ID, sig: SIG,
  },
];
const req = (n: number) => ({
  leafId: ID, audience: "payment-service", action: "payment.transfer", amount: "10000000",
  target: "supplierA", nonce: nonce(n), deadline: "2000000000", sig: SIG,
});

const cfg: VerifierConfig = {
  version: 1, chainId: 11155111, registry: "0x5000000000000000000000000000000000000005",
  expectedRootIssuer: A, serviceId: "payment-service", asset: "0x3000000000000000000000000000000000000003",
  maxDepth: 8, maxStateAgeSeconds: 60, maxRequestTtlSeconds: 300, stepUpThreshold: 15_000_000n,
};

function build(verdict: Verdict, statusOf?: () => Promise<boolean[]>) {
  const runs = createRunStore();
  const app = createApp({
    cfg,
    verifyLocal: async () => verdict,
    checkRevocation: async () => ({ ok: true }),
    reader: { read: async () => ({ revoked: false, blockTimestamp: 0 }) },
    transfer: async () => "0xdeadbeef" as Hex,
    getBalance: async () => 1n,
    resolveTarget: (t) => (t === "supplierA" ? ("0x4000000000000000000000000000000000000004" as Address) : null),
    nonceStore: createNonceStore(),
    simulated: true,
    runs,
    statusOf,
  });
  return { app, runs };
}

describe("GET /requests", () => {
  it("is empty before anything happens and allows the dashboard origin", async () => {
    const { app } = build({ ok: true });
    const res = await request(app).get("/requests");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("records an executed payment with its tx hash, bigints as strings", async () => {
    const { app } = build({ ok: true });
    const r = await request(app).post("/execute").send({ chain, request: req(2) });
    expect(r.status).toBe(200);
    await vi.waitFor(async () => expect((await request(app).get("/requests")).body).toHaveLength(1));
    const [run] = (await request(app).get("/requests")).body;
    expect(run.scenario).toBe("legit");
    expect(run.txHash).toBe("0xdeadbeef");
    expect(run.mock).toBe(false);
    expect(run.request.amount).toBe("10000000");
    expect(run.chain[0].scope.maxAmount).toBe("100000000");
    expect(run.verdict).toEqual({ ok: true });
  });

  it("records an amplification denial and lists newest first", async () => {
    const denial: Verdict = {
      ok: false, code: "AMPLIFICATION", detail: "scope expands its parent (edge 0: maxAmount)",
      edges: [{ edge: 0, failures: [{ dimension: "maxAmount", reason: "r", parentValue: "1", childValue: "2" }] }],
    };
    const { app } = build(denial);
    await request(app).post("/execute").send({ chain, request: req(3) });
    await request(app).post("/execute").send({ chain, request: req(4) });
    await vi.waitFor(async () => expect((await request(app).get("/requests")).body).toHaveLength(2));
    const body = (await request(app).get("/requests")).body;
    expect(body[0].scenario).toBe("amplify");
    expect(body[0].verdict.edges[0].failures[0].dimension).toBe("maxAmount");
    expect(body[0].txHash).toBeUndefined();
    expect(body[0].request.nonce).toBe(nonce(4)); // newest first
  });

  it("a failing revocation lookup for display never changes the response", async () => {
    const { app } = build({ ok: true }, async () => {
      throw new Error("rpc down");
    });
    const r = await request(app).post("/execute").send({ chain, request: req(5) });
    expect(r.status).toBe(200);
    await vi.waitFor(async () => expect((await request(app).get("/requests")).body).toHaveLength(1));
    expect((await request(app).get("/requests")).body[0].revoked).toEqual([false]);
  });
});

describe("history labels", () => {
  it("does not describe a denied or failed request as a payment inside its permit", async () => {
    const { app } = build({ ok: false, code: "OUT_OF_SCOPE", detail: "amount exceeds ceiling" });
    await request(app).post("/execute").send({ chain, request: req(20) });
    await vi.waitFor(async () => expect((await request(app).get("/requests")).body).toHaveLength(1));
    const [run] = (await request(app).get("/requests")).body;
    expect(run.attempted).toBe("Request denied: OUT_OF_SCOPE");
    expect(run.attempted).not.toContain("within its permit");
  });

  it("labels an approved above-threshold payment as a step-up, naming how it was approved", async () => {
    const runs = createRunStore();
    await runs.add({ chain: chain as any, request: req(21) as any, verdict: { ok: true }, now: 1, approval: "demo-bypass", txHash: "0xabc" as Hex });
    const [run] = runs.list() as any[];
    expect(run.scenario).toBe("stepup");
    expect(run.attempted).toContain("demo bypass");
    expect(run.stepUp).toEqual({ required: true, approved: "demo-bypass" });
  });
});
