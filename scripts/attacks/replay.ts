import "dotenv/config";
import type { UnsignedRequest } from "@mandate/core";
import { requirePk, serviceId } from "../lib/env.js";
import { freshNonce } from "../lib/nonce.js";
import { signRequest } from "../lib/signer.js";
import { readChainFile } from "../lib/chain-file.js";
import { postExecute } from "../lib/http.js";

const USDC = (n: number): bigint => BigInt(n) * 1_000_000n;

async function main(): Promise<void> {
  const settlePk = requirePk("SETTLE_PK");
  const chain = readChainFile();
  const leaf = chain[chain.length - 1];

  const unsignedRequest: UnsignedRequest = {
    leafId: leaf.id,
    audience: serviceId(),
    action: "payment.transfer",
    // DEMO_AMOUNT lets a faucet-funded wallet run the demo with less than $10
    amount: BigInt(Math.round(Number(process.env.DEMO_AMOUNT ?? "10") * 1_000_000)),
    target: "supplierA",
    nonce: freshNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const request = await signRequest(unsignedRequest, settlePk);

  const first = await postExecute(chain, request);
  console.log(`first send  -> ${first.status}`, JSON.stringify(first.body));

  const second = await postExecute(chain, request);
  console.log(`second send -> ${second.status}`, JSON.stringify(second.body));

  if (second.body.code !== "REPLAY") {
    console.error(`expected REPLAY on the second send, got ${second.body.code ?? "no code"}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
