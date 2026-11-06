import "dotenv/config";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { isAddress } from "viem";

const ROOT = process.cwd();
const tsx = resolve(ROOT, "node_modules/.bin/tsx");

// One command for the local demo: payment service in demo mode (simulated payments, labelled World ID bypass),
// a fresh seeded delegation chain, and the dashboard in live mode with run buttons. Ctrl-C stops everything.
// Revocation is still read from the real Sepolia registry, so SEPOLIA_RPC_URL and REGISTRY_ADDRESS must be set.

const SERVICE = "http://localhost:4000";
const DASHBOARD = "http://localhost:3000";
const children: ChildProcess[] = [];

function stop(code = 0): never {
  for (const c of children) c.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

const env: NodeJS.ProcessEnv = { ...process.env };
for (const name of ["SUPPLIER_A", "SUPPLIER_B"]) {
  const v = env[name];
  if (v && !isAddress(v)) {
    console.warn(`! ${name} in .env is not a valid address, so it is ignored for this simulated demo (fix it before a real payment).`);
    env[name] = ""; // empty, not deleted: dotenv in the child never overrides a variable that is already set
  }
}

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, what: string, seconds = 60): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    if (await up(url)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`${what} did not start within ${seconds}s`);
  stop(1);
}

async function main(): Promise<void> {
  if (await up(`${SERVICE}/balance`)) {
    console.error("Something already answers on :4000. Stop the running payment service first.");
    process.exit(1);
  }
  if (await up(DASHBOARD)) {
    console.error("Something already answers on :3000. Stop the running dashboard first.");
    process.exit(1);
  }

  console.log("starting payment service (demo mode: simulated payments, World ID bypass on)...");
  children.push(spawn(tsx, ["src/server.ts"], { cwd: resolve(ROOT, "packages/payment-service"), env: { ...env, DEMO_MODE: "1" }, stdio: "inherit" }));
  await waitFor(`${SERVICE}/balance`, "payment service");

  console.log("seeding a fresh delegation chain and publishing it to Arkiv and ENS...");
  execFileSync(tsx, ["scripts/fresh-chain.ts"], { cwd: ROOT, env, stdio: "inherit" });

  console.log("starting dashboard...");
  children.push(
    spawn(resolve(ROOT, "packages/dashboard/node_modules/.bin/next"), ["dev", "--webpack", "-p", "3000"], {
      cwd: resolve(ROOT, "packages/dashboard"),
      env: { ...env, NEXT_PUBLIC_SERVICE_URL: SERVICE },
      stdio: "ignore",
    }),
  );
  await waitFor(DASHBOARD, "dashboard");

  console.log(`\nReady. Open ${DASHBOARD}\n  - use the buttons at the top to run a valid payment, an attack, a replay or a revoke\n  - payments are simulated; the checks and the Sepolia revocation read are real\n  - Ctrl-C stops everything\n`);
  for (const c of children) c.on("exit", (code) => { if (code) { console.error("a process exited, stopping"); stop(1); } });
}

main().catch((e) => {
  console.error(e);
  stop(1);
});
