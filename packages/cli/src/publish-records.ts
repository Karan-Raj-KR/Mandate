import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, getAddress } from "viem";
import type { Address, Hex } from "viem";
import { parseChain } from "@mandate/core";
import { clients, need } from "./env.js";
import { resolverAbi } from "./ens.js";
import { RECORD_KEYS, dnsEncode } from "./names.js";

// Writes the mandate:* text records for every agent name in .data/chain.json, in ONE multicall.
// Each agent's name points at the delegation issued TO it; the owner's name has no delegation.
// Usage: pnpm seed && pnpm --filter @mandate/cli publish-records
const { account, pub, wallet } = clients("OWNER_PK");
const resolver = getAddress(need("ENS_RESOLVER")) as Address;
const registry = getAddress(need("REGISTRY_ADDRESS"));
const chain = parseChain(JSON.parse(readFileSync(fileURLToPath(new URL("../../../.data/chain.json", import.meta.url)), "utf8")));

const records: { name: string; key: string; value: string }[] = [
  { name: chain[0]!.issuerName, key: RECORD_KEYS.subject, value: getAddress(chain[0]!.issuer) },
  { name: chain[0]!.issuerName, key: RECORD_KEYS.registry, value: registry },
];
for (const d of chain) {
  records.push(
    { name: d.subjectName, key: RECORD_KEYS.delegationId, value: d.id },
    { name: d.subjectName, key: RECORD_KEYS.delegationUri, value: `arkiv:${d.id}` },
    { name: d.subjectName, key: RECORD_KEYS.parentId, value: d.parent },
    { name: d.subjectName, key: RECORD_KEYS.subject, value: getAddress(d.subject) },
    { name: d.subjectName, key: RECORD_KEYS.registry, value: registry },
  );
}

const calls: Hex[] = records.map((r) => encodeFunctionData({ abi: resolverAbi, functionName: "setText", args: [dnsEncode(r.name), r.key, r.value] }));
const hash = await wallet.writeContract({ address: resolver, abi: resolverAbi, functionName: "multicall", args: [calls], account });
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`multicall reverted: ${hash}`);
console.log(`${records.length} records for ${new Set(records.map((r) => r.name)).size} names in one tx: ${hash}`);
for (const n of new Set(records.map((r) => r.name))) console.log(`  ${n}`);
