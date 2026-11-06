import { addr, bytes, defineSchema, i32, str, u256, u64 } from "@arkiv-network/sdk/schema";

/**
 * One entity per signed delegation. Every column except `payload` is a convenience filter:
 * nothing read back is trusted until the signature, id and chain structure are re-verified
 * locally (see explore.ts). Anyone can write entities under this schema name, so reads also
 * filter on a trusted owner.
 *
 * Arkiv has no array column, so `actions` and `targets` are stored as comma-joined strings
 * (sorted and deduped, as in the signed scope) and are limited to 128 bytes.
 */
export const DelegationSchema = defineSchema("mandate.delegation", {
  id: str().indexed(),
  parentId: str().indexed(),
  rootId: str().indexed(),
  issuer: addr().indexed(),
  subject: addr().indexed(),
  actions: str().indexed(),
  maxAmount: u256().indexed(),
  expiry: u64().indexed(),
  targets: str().indexed(),
  depth: i32().indexed(),
  /** the full signed delegation as JSON (bigints as decimal strings) */
  payload: bytes(),
});
