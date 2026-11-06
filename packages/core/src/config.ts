import { getAddress } from "viem";
import type { Address } from "viem";
import { MAX_DEPTH, type VerifierConfig } from "./types.js";

function requireAddress(env: Record<string, string | undefined>, key: string): Address {
  const raw = env[key];
  if (!raw) throw new Error(`missing required env var: ${key}`);
  let checksummed: Address;
  try {
    checksummed = getAddress(raw);
  } catch {
    throw new Error(`invalid address in env var ${key}: ${raw}`);
  }
  return checksummed.toLowerCase() as Address;
}

export function loadVerifierConfig(env: Record<string, string | undefined> = process.env): VerifierConfig {
  const chainId = env.CHAIN_ID ? Number(env.CHAIN_ID) : 11155111;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`invalid CHAIN_ID: ${env.CHAIN_ID}`);
  }

  const registry = requireAddress(env, "REGISTRY_ADDRESS");
  const expectedRootIssuer = requireAddress(env, "ROOT_ISSUER");
  const asset = requireAddress(env, "USDC_ADDRESS");

  const serviceId = env.SERVICE_ID ?? "payment-service";

  const maxStateAgeSeconds = env.MAX_STATE_AGE ? Number(env.MAX_STATE_AGE) : 60;
  if (!Number.isInteger(maxStateAgeSeconds) || maxStateAgeSeconds <= 0) {
    throw new Error(`invalid MAX_STATE_AGE: ${env.MAX_STATE_AGE}`);
  }

  const maxRequestTtlSeconds = env.MAX_REQUEST_TTL ? Number(env.MAX_REQUEST_TTL) : 300;
  if (!Number.isInteger(maxRequestTtlSeconds) || maxRequestTtlSeconds <= 0) {
    throw new Error(`invalid MAX_REQUEST_TTL: ${env.MAX_REQUEST_TTL}`);
  }

  const stepUpThreshold = env.STEP_UP_THRESHOLD ? BigInt(env.STEP_UP_THRESHOLD) : 15000000n;
  if (stepUpThreshold < 0n) {
    throw new Error(`invalid STEP_UP_THRESHOLD: ${env.STEP_UP_THRESHOLD}`);
  }

  return {
    version: 1,
    chainId,
    registry,
    expectedRootIssuer,
    serviceId,
    asset,
    maxDepth: MAX_DEPTH,
    maxStateAgeSeconds,
    maxRequestTtlSeconds,
    stepUpThreshold,
  };
}
