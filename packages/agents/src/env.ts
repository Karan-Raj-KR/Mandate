import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// pnpm runs package scripts from packages/agents, so load the repo-root .env explicitly.
// dotenv never overrides variables already set in the shell.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

export const NAMES = {
  owner: "treasury.dhruv.eth",
  ops: "ops.treasury.dhruv.eth",
  procure: "procure.ops.treasury.dhruv.eth",
  settle: "settle.procure.ops.treasury.dhruv.eth",
} as const;

export const PORTS = {
  ops: Number(process.env.AGENT_OPS_PORT ?? 4101),
  procure: Number(process.env.AGENT_PROCURE_PORT ?? 4102),
  settle: Number(process.env.AGENT_SETTLE_PORT ?? 4103),
} as const;

export function requirePk(key: string): `0x${string}` {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return (v.startsWith("0x") ? v : `0x${v}`) as `0x${string}`;
}
