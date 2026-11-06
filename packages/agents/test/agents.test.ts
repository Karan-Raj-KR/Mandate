import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ZERO_ID, parseChain, parseRequest, randomNonce, signDelegation, verifyLocal } from "@mandate/core";
import type { VerifierConfig } from "@mandate/core";
import { createAgent } from "../src/agent.js";

const REGISTRY = "0x6813aa2574392530b7f1b3c5ed0683d30133fe98" as const;
const domain = { chainId: 11155111, registry: REGISTRY };
const USDC = (n: number) => String(n * 1_000_000);

const owner = privateKeyToAccount(generatePrivateKey());
const accts = { ops: privateKeyToAccount(generatePrivateKey()), procure: privateKeyToAccount(generatePrivateKey()), settle: privateKeyToAccount(generatePrivateKey()) };

const cfg: VerifierConfig = {
  version: 1,
  chainId: domain.chainId,
  registry: REGISTRY,
  expectedRootIssuer: owner.address.toLowerCase() as `0x${string}`,
  serviceId: "payment-service",
  asset: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  maxDepth: 8,
  maxStateAgeSeconds: 60,
  maxRequestTtlSeconds: 300,
  stepUpThreshold: 15_000_000n,
};

const open: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.close()));
});

async function post(base: string, path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
}

/** A stub payment service that records what it was sent. */
async function stubService() {
  const received: any[] = [];
  const server: Server = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      received.push(JSON.parse(data));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  open.push({ close: () => new Promise((r) => server.close(() => r())) });
  return { url: `http://127.0.0.1:${port}`, received };
}

async function start(procureEnforces: boolean) {
  const svc = await stubService();
  const mk = (name: keyof typeof accts, enforceNarrowing: boolean, service?: { url: string; audience: string }) =>
    createAgent({ name, ensName: `${name}.test.eth`, account: accts[name], domain, enforceNarrowing, service });
  const ops = mk("ops", true);
  const procure = mk("procure", procureEnforces);
  const settle = mk("settle", true, { url: svc.url, audience: cfg.serviceId });
  const bases: Record<string, string> = {};
  for (const [k, a] of Object.entries({ ops, procure, settle })) {
    bases[k] = `http://127.0.0.1:${await a.listen(0)}`;
    open.push(a);
  }
  const now = Math.floor(Date.now() / 1000);
  const root = await signDelegation(
    owner,
    {
      v: 1, parent: ZERO_ID, issuer: owner.address, subject: accts.ops.address, issuerName: "owner.test.eth", subjectName: "ops.test.eth",
      scope: { actions: ["invoice.read", "payment.transfer"], maxAmount: 500_000_000n, expiry: now + 86400, targets: ["*"] },
      nonce: randomNonce(),
    },
    domain,
  );
  const wire = (d: unknown) => JSON.parse(JSON.stringify(d, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  expect((await post(bases.ops, "/accept", { chain: wire([root]) })).status).toBe(200);
  const d2 = await post(bases.ops, "/delegate", {
    subject: accts.procure.address, subjectName: "procure.test.eth",
    scope: { actions: ["payment.transfer", "invoice.read"], maxAmount: USDC(100), expiry: now + 7200, targets: ["supplierB", "supplierA"] },
  });
  expect(d2.status).toBe(200);
  // the request above sent unsorted lists; the agent must normalize them or the delegation would not parse
  expect(d2.body.delegation.scope.actions).toEqual(["invoice.read", "payment.transfer"]);
  expect(d2.body.delegation.scope.targets).toEqual(["supplierA", "supplierB"]);
  expect((await post(bases.procure, "/accept", { chain: d2.body.chain })).status).toBe(200);
  return { bases, svc, now };
}

describe("agents", () => {
  it("builds a valid three hop chain and settlement's request passes verifyLocal", async () => {
    const { bases, svc, now } = await start(true);
    const d3 = await post(bases.procure, "/delegate", {
      subject: accts.settle.address, subjectName: "settle.test.eth",
      scope: { actions: ["payment.transfer"], maxAmount: USDC(25), expiry: now + 3600, targets: ["supplierA"] },
    });
    expect(d3.status).toBe(200);
    expect((await post(bases.settle, "/accept", { chain: d3.body.chain })).status).toBe(200);
    const pay = await post(bases.settle, "/pay", { target: "supplierA", amount: USDC(10) });
    expect(pay.status).toBe(200);

    const sent = svc.received[0];
    const verdict = await verifyLocal(parseChain(sent.chain), parseRequest(sent.request), cfg, now);
    expect(verdict).toEqual({ ok: true });
  });

  it("an honest procurement agent refuses to widen settlement's authority", async () => {
    const { bases, now } = await start(true);
    const r = await post(bases.procure, "/delegate", {
      subject: accts.settle.address, subjectName: "settle.test.eth",
      scope: { actions: ["account.manage", "payment.transfer"], maxAmount: USDC(1000), expiry: now + 3600, targets: ["*"] },
    });
    expect(r.status).toBe(422);
    expect(r.body.failures.map((f: any) => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
  });

  it("a rogue procurement agent signs it, and verifyLocal names all three violations on edge 2", async () => {
    const { bases, svc, now } = await start(false);
    const d3 = await post(bases.procure, "/delegate", {
      subject: accts.settle.address, subjectName: "settle.test.eth",
      scope: { actions: ["account.manage", "payment.transfer"], maxAmount: USDC(1000), expiry: now + 3600, targets: ["*"] },
    });
    expect(d3.status).toBe(200);
    expect((await post(bases.settle, "/accept", { chain: d3.body.chain })).status).toBe(200);
    expect((await post(bases.settle, "/pay", { target: "supplierA", amount: USDC(10) })).status).toBe(200);

    const sent = svc.received[0];
    const verdict = await verifyLocal(parseChain(sent.chain), parseRequest(sent.request), cfg, now);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("AMPLIFICATION");
      expect(verdict.edges?.[0]?.edge).toBe(2);
      expect(verdict.edges?.[0]?.failures.map((f) => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
    }
  });

  it("refuses to accept a chain issued to someone else, and to delegate with no authority", async () => {
    const { bases } = await start(true);
    const other = await post(bases.settle, "/delegate", {
      subject: accts.ops.address, subjectName: "x.test.eth",
      scope: { actions: ["payment.transfer"], maxAmount: "1", expiry: 9999999999, targets: ["supplierA"] },
    });
    expect(other.status).toBe(409);
    const wrongRecipient = await post(bases.settle, "/accept", { chain: (await post(bases.ops, "/delegate", {
      subject: accts.procure.address, subjectName: "p.test.eth",
      scope: { actions: ["payment.transfer"], maxAmount: "1", expiry: Math.floor(Date.now() / 1000) + 600, targets: ["supplierA"] },
    })).body.chain });
    expect(wrongRecipient.status).toBe(400);
  });
});
