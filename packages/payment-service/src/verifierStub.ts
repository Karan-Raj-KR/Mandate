import type { Delegation, ExecutionRequest, Verdict, VerifierConfig } from "@mandate/core";

export type VerifyLocalFn = (
  chain: Delegation[],
  request: ExecutionRequest,
  cfg: VerifierConfig,
  now: number,
) => Promise<Verdict>;

export type CheckRevocationFn = (
  chain: Delegation[],
  cfg: VerifierConfig,
  reader: unknown,
  now: number,
) => Promise<Verdict>;

// TODO(integration): swap for the real verifyLocal exported from @mandate/core
// once it lands. Fails closed until then — never change this to allow.
export const verifyLocalStub: VerifyLocalFn = async () => ({
  ok: false,
  code: "SCHEMA",
  detail: "verifier not wired",
});

// TODO(integration): swap for the real checkRevocation exported from
// @mandate/core once it lands. Fails closed until then — never change this
// to allow.
export const checkRevocationStub: CheckRevocationFn = async () => ({
  ok: false,
  code: "SCHEMA",
  detail: "verifier not wired",
});
