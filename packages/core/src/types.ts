import type { Address, Hex } from "viem";

export const ACTIONS = ["invoice.read", "payment.transfer", "account.manage"] as const;
export type Action = (typeof ACTIONS)[number];

export const ZERO_ID = ("0x" + "0".repeat(64)) as Hex;
export const MAX_DEPTH = 8;

export type Scope = {
  actions: Action[];   // sorted, deduped
  maxAmount: bigint;   // per-execution ceiling, USDC 6dp
  expiry: number;      // unix seconds
  targets: string[];   // ["*"] or sorted, deduped concrete ids
};

export type UnsignedDelegation = {
  v: 1; parent: Hex; issuer: Address; subject: Address;
  issuerName: string; subjectName: string; scope: Scope; nonce: Hex;
};
export type Delegation = UnsignedDelegation & { id: Hex; sig: Hex };

export type UnsignedRequest = {
  leafId: Hex; audience: string; action: Action; amount: bigint;
  target: string; nonce: Hex; deadline: bigint;
};
export type ExecutionRequest = UnsignedRequest & { sig: Hex };

export type NarrowFailure = {
  dimension: "actions" | "maxAmount" | "expiry" | "targets";
  reason: string; parentValue: string; childValue: string;
};
/** edge i compares chain[i] (child) against chain[i-1] (parent) */
export type EdgeFailure = { edge: number; failures: NarrowFailure[] };

export type DenyCode =
  | "SCHEMA" | "EMPTY_CHAIN" | "TOO_DEEP" | "NOT_ROOT" | "WRONG_ROOT"
  | "ID_MISMATCH" | "BAD_SIGNATURE" | "PARENT_LINK" | "ISSUER_LINK"
  | "AMPLIFICATION" | "EXPIRED" | "DEADLINE" | "AUDIENCE"
  | "REQUEST_SIGNATURE" | "OUT_OF_SCOPE" | "STEP_UP_REQUIRED"
  | "REPLAY" | "REVOKED" | "REGISTRY_UNAVAILABLE" | "STALE_STATE"
  | "EXECUTION_FAILED";

export type Verdict =
  | { ok: true }
  | { ok: false; code: DenyCode; detail: string; edges?: EdgeFailure[] };

export type VerifierConfig = {
  version: 1;
  chainId: number;
  registry: Address;
  expectedRootIssuer: Address;
  serviceId: string;
  asset: Address;
  maxDepth: number;
  maxStateAgeSeconds: number;
  maxRequestTtlSeconds: number;
  stepUpThreshold: bigint;
};
