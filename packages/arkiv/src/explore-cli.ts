import "./env.js";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { Hex } from "viem";
import { loadVerifierConfig } from "@mandate/core";
import { arkivPublicClient, arkivWriterAccount } from "./client.js";
import { fetchUnderRoot, makeStatusOf, verifyAuthority } from "./explore.js";

// Usage: pnpm --filter @mandate/arkiv explore <root-delegation-id>
// Arkiv query -> local signature and chain checks -> revocation read from Ethereum.
const rootId = process.argv[2] as Hex | undefined;
if (!rootId || !/^0x[0-9a-fA-F]{64}$/.test(rootId)) {
  console.error("usage: explore <root-delegation-id (0x + 64 hex)>");
  process.exit(1);
}
const cfg = loadVerifierConfig();
const rpc = process.env.SEPOLIA_RPC_URL;
if (!rpc) throw new Error("missing required env var: SEPOLIA_RPC_URL");

const { delegations, unreadable } = await fetchUnderRoot(arkivPublicClient(), rootId.toLowerCase() as Hex, [arkivWriterAccount().address]);
console.log(`${delegations.length} delegation(s) found on Arkiv under ${rootId}` + (unreadable ? `, ${unreadable} unreadable and ignored` : ""));
const rows = await verifyAuthority(
  delegations,
  rootId.toLowerCase() as Hex,
  cfg,
  Math.floor(Date.now() / 1000),
  makeStatusOf(createPublicClient({ chain: sepolia, transport: http(rpc) }), cfg),
);
for (const r of rows) {
  console.log(`${"  ".repeat(Math.max(r.depth, 0))}${r.status.padEnd(6)} ${r.d.issuerName} -> ${r.d.subjectName}  max ${r.d.scope.maxAmount}  targets ${r.d.scope.targets.join(",")}`);
  for (const reason of r.reasons) console.log(`${"  ".repeat(Math.max(r.depth, 0))}       - ${reason}`);
}
