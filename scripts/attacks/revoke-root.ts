import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { UnsignedRequest } from "@mandate/core";
import { requireEnv, requirePk, serviceId } from "../lib/env.js";
import { freshNonce } from "../lib/nonce.js";
import { signRequest } from "../lib/signer.js";
import { readChainFile } from "../lib/chain-file.js";
import { postExecute } from "../lib/http.js";
import { revocationRegistryAbi } from "../lib/registry-abi.js";

const USDC = (n: number): bigint => BigInt(n) * 1_000_000n;

async function main(): Promise<void> {
  const ownerPk = requirePk("OWNER_PK");
  const settlePk = requirePk("SETTLE_PK");
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const registryAddress = requireEnv("REGISTRY_ADDRESS");

  const chain = readChainFile();
  const root = chain[0];

  const owner = privateKeyToAccount(ownerPk);
  const client = createWalletClient({ account: owner, chain: sepolia, transport: http(rpcUrl) });

  console.log(`revoking root delegation ${root.id} (issuer ${root.issuer})...`);
  const txHash = await client.writeContract({
    address: registryAddress as `0x${string}`,
    abi: revocationRegistryAbi,
    functionName: "revoke",
    args: [root.id],
  });
  console.log(`https://sepolia.etherscan.io/tx/${txHash}`);

  console.log("waiting for the revocation to be mined...");
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("revocation confirmed on-chain");

  console.log("resending the previously-valid request with a fresh nonce...");
  const leaf = chain[chain.length - 1];
  const unsignedRequest: UnsignedRequest = {
    leafId: leaf.id,
    audience: serviceId(),
    action: "payment.transfer",
    amount: USDC(10),
    target: "supplierA",
    nonce: freshNonce(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
  };
  const request = await signRequest(unsignedRequest, settlePk);

  const { status, body } = await postExecute(chain, request);
  console.log(`-> ${status}`);
  console.log(JSON.stringify(body, null, 2));

  if (body.code !== "REVOKED") {
    console.error(`expected REVOKED, got ${body.code ?? "no code"}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
