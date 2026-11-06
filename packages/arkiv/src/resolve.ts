import { ZERO_ID } from "@mandate/core";
import type { Delegation } from "@mandate/core";
import type { Hex } from "viem";

export type DelegationSource = (id: Hex) => Promise<Delegation | null>;

/**
 * Follow parent ids from a leaf delegation up to the root. Everything fetched is untrusted:
 * this only assembles the chain (and refuses loops, gaps and over-deep chains), it does not verify it.
 */
export async function resolveChain(leafId: Hex, source: DelegationSource, maxDepth = 8): Promise<Delegation[]> {
  const chain: Delegation[] = [];
  const seen = new Set<Hex>();
  let id: Hex = leafId;
  while (true) {
    if (seen.has(id)) throw new Error(`loop in the chain at ${id}`);
    seen.add(id);
    if (chain.length >= maxDepth) throw new Error(`chain is deeper than ${maxDepth}`);
    const d = await source(id);
    if (!d) throw new Error(`delegation ${id} could not be fetched`);
    if (d.id !== id) throw new Error(`source returned ${d.id} when asked for ${id}`);
    chain.unshift(d);
    if (d.parent === ZERO_ID) return chain;
    id = d.parent;
  }
}
