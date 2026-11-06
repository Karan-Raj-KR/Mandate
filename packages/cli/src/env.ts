import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const ENV_PATH = fileURLToPath(new URL("../../../.env", import.meta.url));
config({ path: ENV_PATH });

export function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

export function clients(pkEnv = "OWNER_PK") {
  const rpc = need("SEPOLIA_RPC_URL");
  const raw = need(pkEnv);
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  return {
    account,
    pub: createPublicClient({ chain: sepolia, transport: http(rpc) }),
    wallet: createWalletClient({ account, chain: sepolia, transport: http(rpc) }),
  };
}
