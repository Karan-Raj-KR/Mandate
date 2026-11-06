import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Hex } from "viem";
import { checkRevocation, loadVerifierConfig, makeRegistryReader, verifyLocal } from "@mandate/core";
import { createApp } from "./app.js";
import { getRealBalance, getSimulatedBalance } from "./ledger.js";
import { createNonceStore } from "./nonces.js";
import { createTargetResolver } from "./targets.js";
import { createRealTransfer, createSimulatedTransfer } from "./transfer.js";

// pnpm runs this from packages/payment-service, so load the repo-root .env explicitly.
// dotenv never overrides variables already set in the shell.
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const cfg = loadVerifierConfig();
const simulated = process.env.SIMULATE === "1";

// Revocation is always checked against the real registry — SIMULATE only
// fakes the money movement (transfer/balance), never the security checks.
const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("missing SEPOLIA_RPC_URL");

const servicePk = process.env.SERVICE_PK as Hex | undefined;
if (!simulated && !servicePk) throw new Error("missing SERVICE_PK");

const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const reader = makeRegistryReader(publicClient, cfg);

const transfer = simulated
  ? createSimulatedTransfer()
  : createRealTransfer({ cfg, rpcUrl, servicePk: servicePk! });

const getBalance = simulated
  ? async () => getSimulatedBalance()
  : async () =>
      getRealBalance({ cfg, rpcUrl, serviceAddress: privateKeyToAccount(servicePk!).address });

const app = createApp({
  cfg,
  verifyLocal,
  checkRevocation,
  reader,
  transfer,
  getBalance,
  resolveTarget: createTargetResolver(),
  nonceStore: createNonceStore(),
  simulated,
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`payment-service listening on :${port} (${simulated ? "SIMULATE" : "sepolia"})`);
});
