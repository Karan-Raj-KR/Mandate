import "./env.js";
import { privateKeyToAccount } from "viem/accounts";
import { loadVerifierConfig, randomNonce, signDelegation, toWire, ZERO_ID } from "@mandate/core";
import type { Delegation } from "@mandate/core";
import { NAMES, PORTS, requirePk } from "./env.js";

// Usage: pnpm demo            honest chain, then settle pays supplierA
//        pnpm demo rogue      procurement tries to widen settle's authority
// For the second form, start procurement with ROGUE=1 (pnpm rogue) to see the service deny it.
const rogueMode = process.argv.includes("rogue");

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

  // 3. procurement delegates to settlement (or, in rogue mode, tries to widen it)
  const scope = rogueMode
    ? { actions: ["account.manage", "payment.transfer"], maxAmount: USDC(1000), expiry: now + 3600, targets: ["*"] }
    : { actions: ["payment.transfer"], maxAmount: USDC(25), expiry: now + 3600, targets: ["supplierA"] };
  const d3 = await must(
    `procure -> settle: delegate${rogueMode ? " (WIDENED)" : ""}`,
    post(PORTS.procure, "/delegate", { subject: addr.settle, subjectName: NAMES.settle, scope }),
  );
  if (!d3) {
    if (rogueMode) console.log("an honest procurement agent refused locally. Start it with ROGUE=1 to see the service deny the chain instead.");
    return;
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
