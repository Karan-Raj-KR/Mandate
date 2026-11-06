import { config, parse } from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// pnpm runs package scripts from packages/agents, so load the repo-root .env explicitly.
// dotenv never overrides variables already set in the shell.
const ENV_PATH = fileURLToPath(new URL("../../../.env", import.meta.url));
config({ path: ENV_PATH });

/** A different OPENAI_API_KEY exported in the shell silently beats .env (dotenv never overrides),
 *  which produced a confusing HTTP 401. For this key the project's .env is authoritative. */
export function openAiKey(): string | undefined {
  try {
    const fromFile = parse(readFileSync(ENV_PATH)).OPENAI_API_KEY?.trim();
    if (fromFile) return fromFile;
  } catch {
    /* no .env file: fall back to the shell */
  }
  return process.env.OPENAI_API_KEY;
}

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
