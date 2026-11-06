import "./env.js";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function chain() {
  const accessKey = process.env.ARKIV_ACCESS_KEY;
  // Fail closed: without a key the SDK silently falls back to a heavily rate-limited public RPC.
  if (!accessKey) throw new Error("missing required env var: ARKIV_ACCESS_KEY");
  return rabdi({ accessKey });
}

export function arkivPublicClient() {
  return createPublicClient({ chain: chain(), transport: http() });
}

/** Rate-limited public endpoint for hosted read-only pages. Reads are re-verified locally, so a limit can only deny. */
export function arkivOpenReadClient() {
  return createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http() });
}

export function arkivWriterAccount() {
  const pk = process.env.ARKIV_PK;
  if (!pk) throw new Error("missing required env var: ARKIV_PK");
  return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
}

export function arkivWalletClient() {
  return createWalletClient({ chain: chain(), transport: http(), account: arkivWriterAccount() });
}
