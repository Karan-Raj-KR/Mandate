import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { ZERO_ID, checkAllEdges } from "@mandate/core";
import type { Delegation, UnsignedDelegation } from "@mandate/core";
import { requirePk, serviceId } from "./lib/env.js";
import { freshNonce } from "./lib/nonce.js";
import { signDelegation } from "./lib/signer.js";
import { writeChainFile } from "./lib/chain-file.js";
import { getBalance } from "./lib/http.js";

const USDC = (n: number): bigint => BigInt(n) * 1_000_000n;
const now = Math.floor(Date.now() / 1000);
const DAY = 24 * 3600;

// Agent names hang off the ENS name we registered on Sepolia (ENS_ROOT_NAME in .env).
const ENS_ROOT = process.env.ENS_ROOT_NAME ?? "mandate-agents.eth";
const NAMES = {
  owner: `treasury.${ENS_ROOT}`,
  ops: `ops.treasury.${ENS_ROOT}`,
  procure: `procure.ops.treasury.${ENS_ROOT}`,
  settle: `settle.procure.ops.treasury.${ENS_ROOT}`,
};

async function main(): Promise<void> {
  const ownerPk = requirePk("OWNER_PK");
  const opsPk = requirePk("OPS_PK");
  const procurePk = requirePk("PROCURE_PK");

  const owner = privateKeyToAccount(ownerPk);
  const ops = privateKeyToAccount(opsPk);
  const procure = privateKeyToAccount(procurePk);
  const settle = privateKeyToAccount(requirePk("SETTLE_PK"));

  const ownerToOpsUnsigned: UnsignedDelegation = {
    v: 1,
    parent: ZERO_ID,
    issuer: owner.address,
    subject: ops.address,
    issuerName: NAMES.owner,
    subjectName: NAMES.ops,
    scope: {
      actions: ["invoice.read", "payment.transfer"],
      maxAmount: USDC(500),
      expiry: now + 10 * DAY,
      targets: ["*"],
    },
    nonce: freshNonce(),
  };
  const ownerToOps = await signDelegation(ownerToOpsUnsigned, ownerPk);

  const opsToProcureUnsigned: UnsignedDelegation = {
    v: 1,
    parent: ownerToOps.id,
    issuer: ops.address,
    subject: procure.address,
    issuerName: NAMES.ops,
    subjectName: NAMES.procure,
    scope: {
      actions: ["invoice.read", "payment.transfer"],
      maxAmount: USDC(100),
      expiry: now + 9 * DAY,
      targets: ["supplierA", "supplierB"],
    },
    nonce: freshNonce(),
  };
  const opsToProcure = await signDelegation(opsToProcureUnsigned, opsPk);

  const procureToSettleUnsigned: UnsignedDelegation = {
    v: 1,
    parent: opsToProcure.id,
    issuer: procure.address,
    subject: settle.address,
    issuerName: NAMES.procure,
    subjectName: NAMES.settle,
    scope: {
      actions: ["payment.transfer"],
      maxAmount: USDC(25),
      expiry: now + 8 * DAY,
      targets: ["supplierA"],
    },
    nonce: freshNonce(),
  };
  const procureToSettle = await signDelegation(procureToSettleUnsigned, procurePk);

  const chain: Delegation[] = [ownerToOps, opsToProcure, procureToSettle];

  const edgeFailures = checkAllEdges(chain);
  if (edgeFailures.length > 0) {
    console.error("refusing to write chain.json — narrows() failed:");
    console.error(JSON.stringify(edgeFailures, null, 2));
    process.exit(1);
  }

  writeChainFile(chain);
  console.log(`service audience: ${serviceId()}`);
  console.log("chain written to .data/chain.json");
  for (const d of chain) {
    console.log(`  ${d.issuerName} -> ${d.subjectName}  id=${d.id}`);
  }

  try {
    const balance = await getBalance();
    console.log(`service balance: ${balance}`);
  } catch (err) {
    console.log("service balance: (service not reachable — start it with `pnpm service`)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
