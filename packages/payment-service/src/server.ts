import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { loadVerifierConfig } from "@mandate/core";
import { createApp } from "./app.js";
import { getRealBalance, getSimulatedBalance } from "./ledger.js";
import { createNonceStore } from "./nonces.js";
import { createTargetResolver } from "./targets.js";
import { createRealTransfer, createSimulatedTransfer } from "./transfer.js";
import { checkRevocationStub, verifyLocalStub } from "./verifierStub.js";

const cfg = loadVerifierConfig();
const simulated = process.env.SIMULATE === "1";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
const servicePk = process.env.SERVICE_PK as Hex | undefined;

if (!simulated && !rpcUrl) throw new Error("missing SEPOLIA_RPC_URL");
if (!simulated && !servicePk) throw new Error("missing SERVICE_PK");

const transfer = simulated
  ? createSimulatedTransfer()
  : createRealTransfer({ cfg, rpcUrl: rpcUrl!, servicePk: servicePk! });

const getBalance = simulated
  ? async () => getSimulatedBalance()
  : async () => getRealBalance({ cfg, rpcUrl: rpcUrl!, serviceAddress: privateKeyToAccount(servicePk!).address });

const app = createApp({
  cfg,
  verifyLocal: verifyLocalStub,
  checkRevocation: checkRevocationStub,
  reader: undefined,
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
