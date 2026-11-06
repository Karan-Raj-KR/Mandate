import { keccak256, toHex } from "viem";
import type { Hex } from "viem";
import { toWire } from "@mandate/core";
import type { ExecutionRequest } from "@mandate/core";

/**
 * Display-only content hash for the receipt. This is NOT the canonical
 * EIP-712 digest (that's computed over the signed typed data by the
 * signing/verification module) — it just gives the dashboard a stable id
 * for "which request was this" without re-deriving the EIP-712 hash here.
 */
export function requestDisplayDigest(request: ExecutionRequest): Hex {
  const { sig, ...unsigned } = request;
  return keccak256(toHex(JSON.stringify(toWire(unsigned))));
}
