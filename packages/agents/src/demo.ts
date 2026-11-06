import "./env.js";
import { privateKeyToAccount } from "viem/accounts";
import { loadVerifierConfig, randomNonce, signDelegation, toWire, ZERO_ID } from "@mandate/core";
import type { Delegation } from "@mandate/core";
import { NAMES, PORTS, requirePk } from "./env.js";

// Usage: pnpm demo            honest chain, then settle pays supplierA
//        pnpm demo rogue      procurement tries to widen settle's authority
// For the second form, start procurement with ROGUE=1 (pnpm rogue) to see the service deny it.
//        pnpm demo llm normal|malicious   the LLM procurement agent reads an invoice and decides what to sign
const rogueMode = process.argv.includes("rogue");
const llmMode = process.argv.includes("llm");
const invoiceName = process.argv.includes("malicious") ? "malicious" : "normal";

const USDC = (n: number): string => String(Math.round(n * 1_000_000));
const now = Math.floor(Date.now() / 1000);
const base = (port: number) => `http://127.0.0.1:${port}`;

async function post(port: number, path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base(port)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toWire(body)),
  });
  return { status: res.status, body: await res.json() };
}

async function must(label: string, p: Promise<{ status: number; body: any }>) {
  const r = await p;
  if (r.status !== 200) {
    console.log(`${label} -> ${r.status} ${JSON.stringify(r.body, null, 2)}`);
    return null;
  }
  console.log(`${label} -> ok`);
  return r.body;
}

async function main(): Promise<void> {
  const cfg = loadVerifierConfig();
  const domain = { chainId: cfg.chainId, registry: cfg.registry };
  const owner = privateKeyToAccount(requirePk("OWNER_PK"));
  const addr = {
    ops: privateKeyToAccount(requirePk("OPS_PK")).address,
    procure: privateKeyToAccount(requirePk("PROCURE_PK")).address,
    settle: privateKeyToAccount(requirePk("SETTLE_PK")).address,
  };

  // 1. the owner signs the root delegation and hands it to operations
  const root: Delegation = await signDelegation(
    owner,
    {
      v: 1,
      parent: ZERO_ID,
      issuer: owner.address,
      subject: addr.ops,
      issuerName: NAMES.owner,
      subjectName: NAMES.ops,
      scope: { actions: ["invoice.read", "payment.transfer"], maxAmount: BigInt(USDC(500)), expiry: now + 24 * 3600, targets: ["*"] },
      nonce: randomNonce(),
    },
    domain,
  );
  if (!(await must("owner -> ops: accept root", post(PORTS.ops, "/accept", { chain: [root] })))) return;

  // 2. operations delegates to procurement
  const d2 = await must(
    "ops -> procure: delegate",
    post(PORTS.ops, "/delegate", {
      subject: addr.procure,
      subjectName: NAMES.procure,
      scope: { actions: ["invoice.read", "payment.transfer"], maxAmount: USDC(100), expiry: now + 2 * 3600, targets: ["supplierA", "supplierB"] },
    }),
  );
  if (!d2 || !(await must("procure: accept", post(PORTS.procure, "/accept", { chain: d2.chain })))) return;

  // 3. procurement delegates to settlement: scripted, widened (rogue), or decided by the LLM
  let d3: { chain: unknown };
  if (llmMode) {
    console.log(`procure reads the ${invoiceName} invoice with the LLM...`);
    const r = await post(PORTS.procure, "/invoice", { invoice: invoiceName });
    if (r.status !== 200) {
      console.log(`procure /invoice -> ${r.status} ${JSON.stringify(r.body)}`);
      return;
    }
    console.log(`model (${r.body.model}) said: ${r.body.text || "(no text)"}`);
    for (const c of r.body.toolCalls) console.log(`model called ${c.name} with ${JSON.stringify(c.args)}`);
    if (r.body.error) console.log(`error: ${r.body.error}`);
    if (!r.body.chain) {
      console.log("the model signed nothing, so there is nothing to send to the payment service.");
      return;
    }
    d3 = r.body;
  } else {
    const scope = rogueMode
      ? { actions: ["account.manage", "payment.transfer"], maxAmount: USDC(1000), expiry: now + 3600, targets: ["*"] }
      : { actions: ["payment.transfer"], maxAmount: USDC(25), expiry: now + 3600, targets: ["supplierA"] };
    const scripted = await must(
      `procure -> settle: delegate${rogueMode ? " (WIDENED)" : ""}`,
      post(PORTS.procure, "/delegate", { subject: addr.settle, subjectName: NAMES.settle, scope }),
    );
    if (!scripted) {
      if (rogueMode) console.log("an honest procurement agent refused locally. Start it with ROGUE=1 to see the service deny the chain instead.");
      return;
    }
    d3 = scripted;
  }
  if (!(await must("settle: accept", post(PORTS.settle, "/accept", { chain: d3.chain })))) return;

  // 4. settlement pays; the payment service is the enforcement boundary
  const amount = USDC(Number(process.env.DEMO_AMOUNT ?? "10"));
  const pay = await post(PORTS.settle, "/pay", { target: "supplierA", amount });
  console.log(`settle -> payment service: ${pay.body?.service?.status ?? pay.status}`);
  console.log(JSON.stringify(pay.body?.service?.body ?? pay.body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
