import { randomBytes } from "node:crypto";
import type { Hex } from "viem";

export function freshNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}` as Hex;
}
