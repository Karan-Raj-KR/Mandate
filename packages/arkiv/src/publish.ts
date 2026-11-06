import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { stringToBytes } from "viem";
import type { Hex } from "viem";
import { toWire, ZERO_ID } from "@mandate/core";
import type { Delegation } from "@mandate/core";
import { DelegationSchema } from "./schema.js";

const MAX_STR_BYTES = 128;

function checkedStr(name: string, v: string): string {
  const n = new TextEncoder().encode(v).length;
  if (n > MAX_STR_BYTES) throw new Error(`${name} is ${n} bytes, Arkiv string columns hold at most ${MAX_STR_BYTES}`);
  return v;
}

/** The columns stored for one delegation. Pure, so it is testable without the network. */
export function toRow(d: Delegation, rootId: Hex, depth: number) {
  return {
    id: d.id,
    parentId: d.parent,
    rootId,
    issuer: addr(d.issuer),
    subject: addr(d.subject),
    actions: checkedStr("actions", d.scope.actions.join(",")),
    maxAmount: d.scope.maxAmount,
    expiry: u64(BigInt(d.scope.expiry)),
    targets: checkedStr("targets", d.scope.targets.join(",")),
    depth,
    payload: stringToBytes(JSON.stringify(toWire(d))),
  };
}

type Wallet = { createEntity: (...args: any[]) => Promise<{ entityKey: Hex; txHash: Hex }> };

/** Writes every delegation of a chain, root first. The entity expires when the delegation does. */
export async function publishChain(wallet: Wallet, chain: Delegation[], now = Math.floor(Date.now() / 1000)) {
  const root = chain[0];
  if (!root || root.parent !== ZERO_ID) throw new Error("chain must start at a root delegation");
  const out: { id: Hex; entityKey: Hex; txHash: Hex }[] = [];
  for (const [depth, d] of chain.entries()) {
    if (d.scope.expiry <= now) throw new Error(`delegation ${depth} is already expired, not publishing it`);
    const { entityKey, txHash } = await wallet.createEntity(DelegationSchema, toRow(d, root.id, depth), {
      expiration: ExpirationTime.atDate(new Date(d.scope.expiry * 1000)),
    });
    out.push({ id: d.id, entityKey, txHash });
  }
  return out;
}
