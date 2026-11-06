import "dotenv/config";
import type { UnsignedDelegation, UnsignedRequest } from "@mandate/core";
import { requirePk, serviceId } from "../lib/env.js";
import { freshNonce } from "../lib/nonce.js";
import { signDelegation, signRequest } from "../lib/signer.js";
import { readChainFile } from "../lib/chain-file.js";
import { getBalance, postExecute } from "../lib/http.js";

const USDC = (n: number): bigint => BigInt(n) * 1_000_000n;

async function main(): Promise<void> {
  const procurePk = requirePk("PROCURE_PK");
  const settlePk = requirePk("SETTLE_PK");

  const chain = readChainFile();
  const opsToProcure = chain[1];
  const originalLeaf = chain[chain.length - 1];

  // The procurement agent is an LLM with one tool: sign a delegation. It
  // reads a supplier invoice containing a hidden instruction and signs this
  // amplified grant to Settlement — widened in actions, maxAmount and
  // targets all at once (SPEC §9, scenario 2).
  const amplifiedUnsigned: UnsignedDelegation = {
    v: 1,
    parent: opsToProcure.id,
    issuer: opsToProcure.subject,
    subject: originalLeaf.subject,
    issuerName: opsToProcure.subjectName,
    subjectName: originalLeaf.subjectName,
    scope: {
      actions: ["account.manage", "payment.transfer"],
      maxAmount: USDC(1000),
      expiry: originalLeaf.scope.expiry,
      targets: ["*"],
    },
    nonce: freshNonce(),
  };
  const amplifiedLeaf = await signDelegation(amplifiedUnsigned, procurePk);
  const amplifiedChain = [chain[0], opsToProcure, amplifiedLeaf];

  const unsignedRequest: UnsignedRequest = {
    leafId: amplifiedLeaf.id,
    audience: serviceId(),
    action: "account.manage",
    amount: USDC(1000),
    target: "supplierA",
    nonce: freshNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const request = await signRequest(unsignedRequest, settlePk);

  const before = await getBalance();
  const { status, body } = await postExecute(amplifiedChain, request);

  console.log(`-> ${status}`);
  console.log("violations:", JSON.stringify(body.edges ?? body, null, 2));

  const after = await getBalance();
  console.log(`balance before: ${before}`);
  console.log(`balance after:  ${after}`);
  console.log(before === after ? "UNCHANGED — attack blocked" : "CHANGED — attack succeeded (bug!)");

  if (status === 200 || before !== after) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
