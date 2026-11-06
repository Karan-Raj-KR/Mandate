import { packetToBytes } from "viem/ens";
import type { Hex } from "viem";
import { bytesToHex } from "viem";

/** DNS wire encoding of an ENS name, which is what the PermissionedResolver's setters take. */
export function dnsEncode(name: string): Hex {
  return bytesToHex(packetToBytes(name));
}

export const RECORD_KEYS = {
  delegationId: "mandate:delegation-id",
  delegationUri: "mandate:delegation-uri",
  parentId: "mandate:parent-id",
  subject: "mandate:subject",
  registry: "mandate:registry",
} as const;
