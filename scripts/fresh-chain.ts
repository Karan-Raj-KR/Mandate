import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Seed a new chain, then publish it, so the Explorer and `verify <ens-name>` always see the chain the demo is using.
// Writes to Arkiv and sends one Sepolia transaction from OWNER_PK.
const ROOT = process.cwd();
const tsx = resolve(ROOT, "node_modules/.bin/tsx");
const run = (cwd: string, file: string) => execFileSync(tsx, [file], { cwd: resolve(ROOT, cwd), stdio: "inherit" });

run(".", "scripts/seed.ts");
run("packages/arkiv", "src/publish-cli.ts");
run("packages/cli", "src/publish-records.ts");
