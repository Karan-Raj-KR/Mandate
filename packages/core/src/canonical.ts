import { hashTypedData, type Hex, type TypedDataDomain } from "viem";
import type { UnsignedDelegation, UnsignedRequest, VerifierConfig } from "./types.js";

type DomainConfig = Pick<VerifierConfig, "chainId" | "registry">;

// Native string[] types so ["a,b"] and ["a","b"] cannot collide.
export const TYPES = {
  Scope: [
    { name: "actions", type: "string[]" },
    { name: "maxAmount", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "targets", type: "string[]" },
  ],
  Delegation: [
    { name: "v", type: "uint8" },
    { name: "parent", type: "bytes32" },
    { name: "issuer", type: "address" },
    { name: "subject", type: "address" },
    { name: "issuerName", type: "string" },
    { name: "subjectName", type: "string" },
    { name: "scope", type: "Scope" },
    { name: "nonce", type: "bytes32" },
  ],
  ExecutionRequest: [
    { name: "leafId", type: "bytes32" },
    { name: "audience", type: "string" },
    { name: "action", type: "string" },
    { name: "amount", type: "uint256" },
    { name: "target", type: "string" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

/** chainId and verifyingContract come only from the service config, never from a token. */
export function domain(cfg: DomainConfig): TypedDataDomain {
  return { name: "Mandate", version: "1", chainId: cfg.chainId, verifyingContract: cfg.registry };
}

export function delegationTypedData(d: UnsignedDelegation, cfg: DomainConfig) {
  return {
    domain: domain(cfg),
    types: TYPES,
    primaryType: "Delegation" as const,
    message: {
      v: d.v,
      parent: d.parent,
      issuer: d.issuer,
      subject: d.subject,
      issuerName: d.issuerName,
      subjectName: d.subjectName,
      scope: {
        actions: d.scope.actions,
        maxAmount: d.scope.maxAmount,
        expiry: BigInt(d.scope.expiry),
        targets: d.scope.targets,
      },
      nonce: d.nonce,
    },
  };
}

export function requestTypedData(r: UnsignedRequest, cfg: DomainConfig) {
  return {
    domain: domain(cfg),
    types: TYPES,
    primaryType: "ExecutionRequest" as const,
    message: {
      leafId: r.leafId,
      audience: r.audience,
      action: r.action,
      amount: r.amount,
      target: r.target,
      nonce: r.nonce,
      deadline: r.deadline,
    },
  };
}

/** EIP-712 digest of every delegation field except id and sig. */
export function delegationId(d: UnsignedDelegation, cfg: DomainConfig): Hex {
  return hashTypedData(delegationTypedData(d, cfg));
}

export function requestDigest(r: UnsignedRequest, cfg: DomainConfig): Hex {
  return hashTypedData(requestTypedData(r, cfg));
}

export function stripDelegation(d: UnsignedDelegation & { id?: Hex; sig?: Hex }): UnsignedDelegation {
  const { v, parent, issuer, subject, issuerName, subjectName, scope, nonce } = d;
  return { v, parent, issuer, subject, issuerName, subjectName, scope, nonce };
}

export function stripRequest(r: UnsignedRequest & { sig?: Hex }): UnsignedRequest {
  const { leafId, audience, action, amount, target, nonce, deadline } = r;
  return { leafId, audience, action, amount, target, nonce, deadline };
}
