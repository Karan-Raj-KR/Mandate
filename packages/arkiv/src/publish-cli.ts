import "./env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseChain } from "@mandate/core";
import { arkivWalletClient } from "./client.js";
import { publishChain } from "./publish.js";

// Usage: pnpm --filter @mandate/arkiv publish-chain      publishes .data/chain.json (written by `pnpm seed`)
const path = fileURLToPath(new URL("../../../.data/chain.json", import.meta.url));
const chain = parseChain(JSON.parse(readFileSync(path, "utf8")));
const written = await publishChain(arkivWalletClient(), chain);
console.log(`root id: ${chain[0]!.id}`);
for (const w of written) console.log(`  ${w.id} -> entity ${w.entityKey}  tx ${w.txHash}`);
console.log("explore it: pnpm --filter @mandate/arkiv explore " + chain[0]!.id);
