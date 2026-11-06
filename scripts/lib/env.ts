import "dotenv/config";
import type { Hex } from "viem";

export function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing required env var: ${key}`);
  return v;
}

export function requirePk(key: string): Hex {
  const v = requireEnv(key);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
}

export function serviceBaseUrl(): string {
  return `http://localhost:${process.env.PORT ?? 4000}`;
}

export function serviceId(): string {
  return process.env.SERVICE_ID ?? "payment-service";
}
