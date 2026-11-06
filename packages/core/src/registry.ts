import { parseAbi, type Address, type Hex, type PublicClient } from "viem";
import type { VerifierConfig } from "./types.js";

export const registryAbi = parseAbi([
  "function revoke(bytes32 id)",
  "function anyRevoked(address[] issuers, bytes32[] ids) view returns (bool)",
  "function statusOf(address[] issuers, bytes32[] ids) view returns (bool[])",
  "function revoked(address issuer, bytes32 id) view returns (bool)",
  "event Revoked(address indexed issuer, bytes32 indexed id, uint64 at)",
  "error LengthMismatch()",
  "error AlreadyRevoked()",
]);

export type RegistryReader = {
  read(issuers: Address[], ids: Hex[]): Promise<{ revoked: boolean; blockTimestamp: number }>;
};

/** Reads anyRevoked pinned to the latest block, so the caller can judge how fresh the answer is. */
export function makeRegistryReader(client: PublicClient, cfg: Pick<VerifierConfig, "registry">): RegistryReader {
  return {
    async read(issuers, ids) {
      const block = await client.getBlock({ blockTag: "latest" });
      const revoked = await client.readContract({
        address: cfg.registry,
        abi: registryAbi,
        functionName: "anyRevoked",
        args: [issuers, ids],
        blockNumber: block.number,
      });
      return { revoked, blockTimestamp: Number(block.timestamp) };
    },
  };
}
