import { createPublicClient, getAddress, http, isAddressEqual } from "viem";
import type { Address, Hex } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { arkivOpenReadClient, fetchById, makeStatusOf, resolveChain, verifyAuthority } from "@mandate/arkiv";
import { loadVerifierConfig, toWire } from "@mandate/core";

// Read-only discovery from an ENS name: text records -> chain from Arkiv -> local checks -> revocation from Ethereum.
// Same steps as the verify CLI. Holds no signing key, and anything unreadable comes back denied with a reason.
export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function GET(req: Request) {
  try {
    const raw = (new URL(req.url).searchParams.get("name") ?? "").trim();
    if (!raw.endsWith(".eth") || raw.length > 255) return fail("name must be an ENS name ending in .eth", 400);
    const name = normalize(raw);

    const cfg = loadVerifierConfig();
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) return fail("SEPOLIA_RPC_URL is not set", 503);
    const owners = process.env.ARKIV_TRUSTED_OWNERS?.split(",").map((s) => getAddress(s.trim()) as Address);
    if (!owners?.length) return fail("ARKIV_TRUSTED_OWNERS is not set", 503);

    const pub = createPublicClient({ chain: sepolia, transport: http(rpc) });
    const text = (key: string) => pub.getEnsText({ name, key });

    const leafId = await text("mandate:delegation-id");
    if (!leafId || !/^0x[0-9a-fA-F]{64}$/.test(leafId)) return fail("no valid mandate:delegation-id record on this name", 404);
    const recRegistry = await text("mandate:registry");
    if (recRegistry && !isAddressEqual(recRegistry as Address, cfg.registry)) return fail(`name points at registry ${recRegistry}, not the configured one`, 403);

    const client = arkivOpenReadClient();
    const chain = await resolveChain(leafId as Hex, (id) => fetchById(client, id, owners));
    const recSubject = await text("mandate:subject");
    const leaf = chain[chain.length - 1]!;
    if (recSubject && !isAddressEqual(recSubject as Address, leaf.subject)) return fail(`name says subject ${recSubject}, the delegation says ${leaf.subject}`, 403);

    const rows = await verifyAuthority(chain, chain[0]!.id, cfg, Math.floor(Date.now() / 1000), makeStatusOf(pub as any, cfg));
    return Response.json({ name, leafId, verified: rows.every((r) => r.status === "USABLE"), rows: toWire(rows) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "verify failed", 502);
  }
}
