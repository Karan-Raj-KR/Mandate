// ASSUMED INTERFACE — Havinash's sign.ts has not landed in @mandate/core yet
// (no havinash/mvp branch, no canonical.ts/sign.ts anywhere in the repo as of
// this writing). This file is the single place the rest of scripts/** import
// signing from, so that once his real module lands there is exactly one spot
// to fix.
//
// Assumed shape, based on his own checkpoint plan
// (AI/prompts/PROMPT_HAVINASH.md): sign a delegation with the issuer's key,
// sign an execution request with the final subject's key, both via viem,
// with the EIP-712 id/digest computed internally from canonical.ts:
//
//   signDelegation(unsigned: UnsignedDelegation, privateKey: Hex): Promise<Delegation>
//   signRequest(unsigned: UnsignedRequest, privateKey: Hex): Promise<ExecutionRequest>
//
// If his real signature differs (e.g. takes a viem Account instead of a raw
// key, or an explicit domain/config argument), fix the import below —
// nothing else in scripts/** should need to change.
export { signDelegation, signRequest } from "@mandate/core";
