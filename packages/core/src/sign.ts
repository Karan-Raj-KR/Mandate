import { bytesToHex, isAddressEqual, type Hex, type LocalAccount } from "viem";
import { delegationId, delegationTypedData, requestTypedData, stripDelegation, stripRequest } from "./canonical.js";
import type { Delegation, ExecutionRequest, UnsignedDelegation, UnsignedRequest, VerifierConfig } from "./types.js";

type DomainConfig = Pick<VerifierConfig, "chainId" | "registry">;

export function randomNonce(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function signDelegation(account: LocalAccount, d: UnsignedDelegation, cfg: DomainConfig): Promise<Delegation> {
  if (!isAddressEqual(account.address, d.issuer)) {
    throw new Error(`signer ${account.address} is not the delegation issuer ${d.issuer}`);
  }
  const unsigned = stripDelegation(d);
  const sig = await account.signTypedData(delegationTypedData(unsigned, cfg));
  return { ...unsigned, id: delegationId(unsigned, cfg), sig };
}

export async function signRequest(account: LocalAccount, r: UnsignedRequest, cfg: DomainConfig): Promise<ExecutionRequest> {
  const unsigned = stripRequest(r);
  const sig = await account.signTypedData(requestTypedData(unsigned, cfg));
  return { ...unsigned, sig };
}
