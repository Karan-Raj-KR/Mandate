import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Address, Hex } from "viem";
import type { VerifierConfig } from "@mandate/core";
import { debitSimulated } from "./ledger.js";
import { erc20Abi } from "./erc20.js";

export type Transfer = (target: Address, amount: bigint) => Promise<Hex>;

function fakeTxHash(): Hex {
  const bytes = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  return `0x${bytes.join("")}` as Hex;
}

export function createSimulatedTransfer(): Transfer {
  return async (_target, amount) => {
    debitSimulated(amount);
    return fakeTxHash();
  };
}

export function createRealTransfer(opts: {
  cfg: VerifierConfig;
  rpcUrl: string;
  servicePk: Hex;
}): Transfer {
  const account = privateKeyToAccount(opts.servicePk);
  const client = createWalletClient({ account, chain: sepolia, transport: http(opts.rpcUrl) });

  return async (target, amount) => {
    return client.writeContract({
      address: opts.cfg.asset,
      abi: erc20Abi,
      functionName: "transfer",
      args: [target, amount],
    });
  };
}
