import { appendFileSync } from "node:fs";
import { encodeFunctionData, getAddress, toHex, zeroAddress, zeroHash } from "viem";
import type { Hex } from "viem";
import { ENV_PATH, clients } from "./env.js";
import { ENS, ROLE_SET_TEXT, ROLE_SET_TEXT_ADMIN, erc20Abi, factoryAbi, registrarAbi, resolverAbi } from "./ens.js";

// One-time setup: deploy a per-account PermissionedResolver, then register <label>.eth on Sepolia ENSv2.
// Usage: pnpm --filter @mandate/cli register-ens [label]   (default label: mandate-agents)
const label = (process.argv[2] ?? "mandate-agents").toLowerCase();
const DURATION = 365n * 24n * 3600n;
const { account, pub, wallet } = clients("OWNER_PK");
const send = async (p: Promise<Hex>, what: string) => {
  const hash = await p;
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} reverted: ${hash}`);
  console.log(`  ${what}: ${hash}`);
  return r;
};

if (!(await pub.readContract({ address: ENS.ethRegistrar, abi: registrarAbi, functionName: "isAvailable", args: [label] }))) {
  throw new Error(`${label}.eth is not available`);
}
const [base, premium] = await pub.readContract({ address: ENS.ethRegistrar, abi: registrarAbi, functionName: "getRegisterPrice", args: [label, DURATION, ENS.mockUsdc] });
const price = base + premium;
console.log(`registering ${label}.eth for ${account.address}, price ${price} MockUSDC minor units`);

// 1. resolver: one instance that holds text records for every agent name, owner holds ROLE_SET_TEXT
const salt = BigInt(toHex(crypto.getRandomValues(new Uint8Array(16))));
const initData = encodeFunctionData({
  abi: resolverAbi,
  functionName: "initialize",
  args: [[{ account: account.address, roleBitmap: ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN }], []],
});
const resolver = getAddress(await pub.readContract({ address: ENS.verifiableFactory, abi: factoryAbi, functionName: "predictProxyAddress", args: [account.address, salt] }));
await send(wallet.writeContract({ address: ENS.verifiableFactory, abi: factoryAbi, functionName: "deployProxy", args: [ENS.permissionedResolverImpl, salt, initData] }), "deploy resolver");
console.log(`  resolver: ${resolver}`);

// 2. payment token: ENS's own MockUSDC on Sepolia, minted to ourselves if short
const have = await pub.readContract({ address: ENS.mockUsdc, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
if (have < price) await send(wallet.writeContract({ address: ENS.mockUsdc, abi: erc20Abi, functionName: "mint", args: [account.address, price - have] }), "mint MockUSDC");
await send(wallet.writeContract({ address: ENS.mockUsdc, abi: erc20Abi, functionName: "approve", args: [ENS.ethRegistrar, price] }), "approve registrar");

// 3. commit, wait, register
const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
const commitment = await pub.readContract({
  address: ENS.ethRegistrar, abi: registrarAbi, functionName: "makeCommitment",
  args: [label, account.address, secret, zeroAddress, resolver, DURATION, zeroHash],
});
await send(wallet.writeContract({ address: ENS.ethRegistrar, abi: registrarAbi, functionName: "commit", args: [commitment] }), "commit");
const wait = Number(await pub.readContract({ address: ENS.ethRegistrar, abi: registrarAbi, functionName: "MIN_COMMITMENT_AGE" })) + 15;
console.log(`  waiting ${wait}s before register...`);
await new Promise((r) => setTimeout(r, wait * 1000));
await send(
  wallet.writeContract({ address: ENS.ethRegistrar, abi: registrarAbi, functionName: "register", args: [label, account.address, secret, zeroAddress, resolver, DURATION, ENS.mockUsdc, zeroHash] }),
  "register",
);

appendFileSync(ENV_PATH, `\nENS_ROOT_NAME=${label}.eth\nENS_RESOLVER=${resolver}\n`);
console.log(`done: ${label}.eth registered, resolver ${resolver}. Wrote ENS_ROOT_NAME and ENS_RESOLVER to .env.`);
