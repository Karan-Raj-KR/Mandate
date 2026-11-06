import { readFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, http } from "viem";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";
import { arkivPublicClient, arkivWriterAccount, fetchUnderRoot, makeStatusOf, verifyAuthority } from "@mandate/arkiv";
import { loadVerifierConfig, parseChain, toWire } from "@mandate/core";

// Server side only: the Arkiv access key never reaches the browser.
// Arkiv query -> local re-verification (ids, signatures, edges, expiry) -> revocation read from Ethereum.
// Anything that cannot be read or verified comes back DENIED with a reason, never as "unknown".
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function GET(req: Request) {
  try {
    let root = (new URL(req.url).searchParams.get("root") ?? "").trim();
    if (root === "latest") {
      // the chain the seed script wrote last (repo-root .data/chain.json)
      const file = path.resolve(process.cwd(), "../../.data/chain.json");
      root = parseChain(JSON.parse(readFileSync(file, "utf8")))[0]!.id;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(root)) return fail('root must be a 0x… permit id (64 hex) or "latest"', 400);

    const cfg = loadVerifierConfig();
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) return fail("SEPOLIA_RPC_URL is not set", 503);

    const rootId = root.toLowerCase() as Hex;
    const { delegations, unreadable } = await fetchUnderRoot(arkivPublicClient(), rootId, [arkivWriterAccount().address]);
    if (delegations.length === 0) return fail(`no delegations under ${rootId} on Arkiv${unreadable ? ` (${unreadable} unreadable ignored)` : ""}`, 404);

    const rows = await verifyAuthority(delegations, rootId, cfg, Math.floor(Date.now() / 1000), makeStatusOf(createPublicClient({ chain: sepolia, transport: http(rpc) }) as any, cfg));
    return Response.json(toWire(rows));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "explore failed", 502);
  }
}
