import { randomBytes } from "node:crypto";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Address, Hex } from "viem";
import type { VerifierConfig } from "@mandate/core";
import { debitSimulated } from "./ledger.js";
import { erc20Abi } from "./erc20.js";

export type Transfer = (target: Address, amount: bigint) => Promise<Hex>;

function fakeTxHash(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
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
