import "dotenv/config";
import type { UnsignedRequest } from "@mandate/core";
import { requirePk, serviceId } from "./lib/env.js";
import { freshNonce } from "./lib/nonce.js";
import { signRequest } from "./lib/signer.js";
import { readChainFile } from "./lib/chain-file.js";
import { postExecute } from "./lib/http.js";

const USDC = (n: number): bigint => BigInt(Math.round(n * 1_000_000));

async function main(): Promise<void> {
  const amountArg = process.argv[2] ?? "10";
  const targetArg = process.argv[3] ?? "supplierA";
  const amount = USDC(Number(amountArg));

  const settlePk = requirePk("SETTLE_PK");
  const chain = readChainFile();
  const leaf = chain[chain.length - 1];

  const unsignedRequest: UnsignedRequest = {
    leafId: leaf.id,
    audience: serviceId(),
    action: "payment.transfer",
    amount,
    target: targetArg,
    nonce: freshNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const request = await signRequest(unsignedRequest, settlePk);

  const { status, body } = await postExecute(chain, request);
  console.log(`-> ${status}`);
  console.log(JSON.stringify(body, null, 2));

  if (status !== 200) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
