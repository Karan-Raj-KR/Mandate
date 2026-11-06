// Adapter over the real signDelegation/signRequest in @mandate/core (sign.ts).
// His actual signature takes a viem LocalAccount + an explicit domain config
// (chainId, registry) rather than a raw private key:
//
//   signDelegation(account: LocalAccount, d: UnsignedDelegation, cfg: DomainConfig): Promise<Delegation>
//   signRequest(account: LocalAccount, r: UnsignedRequest, cfg: DomainConfig): Promise<ExecutionRequest>
//
// This file absorbs that difference so every other script in scripts/** can
// keep calling signDelegation(unsigned, privateKey) / signRequest(unsigned, privateKey).
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  loadVerifierConfig,
  signDelegation as realSignDelegation,
  signRequest as realSignRequest,
} from "@mandate/core";
import type { Delegation, ExecutionRequest, UnsignedDelegation, UnsignedRequest } from "@mandate/core";

function domainConfig() {
  const cfg = loadVerifierConfig();
  return { chainId: cfg.chainId, registry: cfg.registry };
}

export async function signDelegation(unsigned: UnsignedDelegation, privateKey: Hex): Promise<Delegation> {
  return realSignDelegation(privateKeyToAccount(privateKey), unsigned, domainConfig());
}

export async function signRequest(unsigned: UnsignedRequest, privateKey: Hex): Promise<ExecutionRequest> {
  return realSignRequest(privateKeyToAccount(privateKey), unsigned, domainConfig());
}
