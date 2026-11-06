import type { Hex } from "viem";

export type NonceStore = {
  checkAndConsume: (nonce: Hex) => boolean;
  /** Read-only peek, so an expensive step can be skipped for a request that is already a replay. Never a substitute for checkAndConsume. */
  has: (nonce: Hex) => boolean;
};

/**
 * In-memory, restart-unsafe nonce replay guard — fine for a hackathon
 * prototype, never for production. checkAndConsume must stay fully
 * synchronous: no await may separate the `has` check from the `add`, or two
 * concurrent requests with the same nonce could both pass.
 */
export function createNonceStore(): NonceStore {
  const consumed = new Set<Hex>();
  return {
    has: (nonce: Hex) => consumed.has(nonce),
    checkAndConsume(nonce: Hex): boolean {
      if (consumed.has(nonce)) return false;
      consumed.add(nonce);
      return true;
    },
  };
}
