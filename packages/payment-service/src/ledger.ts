import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import type { Address } from "viem";
import type { VerifierConfig } from "@mandate/core";
import { erc20Abi } from "./erc20.js";

/** In-memory ledger used when SIMULATE=1. Resets on restart. */
let simulatedBalance = 1_000_000_000_000n; // 1,000,000 USDC at 6dp

export function getSimulatedBalance(): bigint {
  return simulatedBalance;
}

export function debitSimulated(amount: bigint): void {
  simulatedBalance -= amount;
}

export function resetSimulatedBalance(amount = 1_000_000_000_000n): void {
  simulatedBalance = amount;
}

export async function getRealBalance(opts: {
  cfg: VerifierConfig;
  rpcUrl: string;
  serviceAddress: Address;
}): Promise<bigint> {
  const client = createPublicClient({ chain: sepolia, transport: http(opts.rpcUrl) });
  const balance = await client.readContract({
    address: opts.cfg.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [opts.serviceAddress],
  });
  return balance as bigint;
}
