import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, isAddressEqual } from "viem";
import type { Address, Hex } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { arkivPublicClient, arkivWriterAccount, fetchById, makeStatusOf, verifyAuthority } from "@mandate/arkiv";
import { loadVerifierConfig, parseChain } from "@mandate/core";
import { need } from "./env.js";
import { RECORD_KEYS } from "./names.js";
import { resolveChain, type DelegationSource } from "./resolve.js";

// Usage: pnpm --filter @mandate/cli verify <ens-name> [--from-file]
// From a name alone: ENS records -> delegation chain (Arkiv, or .data/chain.json with --from-file)
// -> local signature, narrowing and expiry checks -> revocation read from Ethereum.
// An ENS name is an entry point, not proof: everything fetched stays untrusted until it verifies.
const name = process.argv[2];
const fromFile = process.argv.includes("--from-file");
if (!name) {
  console.error("usage: verify <ens-name> [--from-file]");
  process.exit(1);
}

const cfg = loadVerifierConfig();
const pub = createPublicClient({ chain: sepolia, transport: http(need("SEPOLIA_RPC_URL")) });
const ens = (key: string) => pub.getEnsText({ name: normalize(name), key });

const fail = (why: string): never => {
  console.log(`DENIED  ${name}\n  - ${why}`);
  process.exit(2);
};

const leafId = (await ens(RECORD_KEYS.delegationId)) as Hex | null;
if (!leafId || !/^0x[0-9a-fA-F]{64}$/.test(leafId)) fail(`no valid ${RECORD_KEYS.delegationId} record on this name`);
const recRegistry = await ens(RECORD_KEYS.registry);
// The registry is pinned by our own config. A name that points somewhere else is not trusted.
if (recRegistry && !isAddressEqual(recRegistry as Address, cfg.registry)) fail(`name points at registry ${recRegistry}, not the configured ${cfg.registry}`);
console.log(`${name}\n  ${RECORD_KEYS.delegationId} ${leafId}`);

let source: DelegationSource;
if (fromFile) {
  const all = parseChain(JSON.parse(readFileSync(fileURLToPath(new URL("../../../.data/chain.json", import.meta.url)), "utf8")));
  source = async (id) => all.find((d) => d.id === id) ?? null;
  console.log("  source: .data/chain.json (--from-file)");
} else {
  const owners = (process.env.ARKIV_TRUSTED_OWNERS?.split(",").map((s) => s.trim() as Address)) ?? [arkivWriterAccount().address];
  const client = arkivPublicClient();
  source = (id) => fetchById(client, id, owners);
  console.log("  source: Arkiv");
}

let chain;
try {
  chain = await resolveChain(leafId as Hex, source);
} catch (e) {
  fail(e instanceof Error ? e.message : "could not assemble the chain");
}
const leaf = chain![chain!.length - 1]!;
const recSubject = await ens(RECORD_KEYS.subject);
if (recSubject && !isAddressEqual(recSubject as Address, leaf.subject)) fail(`name says subject ${recSubject}, the delegation says ${leaf.subject}`);

const rows = await verifyAuthority(chain!, chain![0]!.id, cfg, Math.floor(Date.now() / 1000), makeStatusOf(pub as any, cfg));
for (const r of rows) {
  console.log(`  hop ${r.depth}  ${r.status.padEnd(6)} ${r.d.issuerName} -> ${r.d.subjectName}  max ${r.d.scope.maxAmount}  targets ${r.d.scope.targets.join(",")}`);
  for (const reason of r.reasons) console.log(`            - ${reason}`);
}
const ok = rows.every((r) => r.status === "USABLE");
console.log(ok ? `VERIFIED  ${chain!.length}-hop chain to ${chain![0]!.issuerName} is usable now` : `DENIED  ${name}`);
process.exit(ok ? 0 : 2);
