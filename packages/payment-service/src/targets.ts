import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

export type TargetResolver = (target: string) => Address | null;

export function createTargetResolver(
  env: Record<string, string | undefined> = process.env,
): TargetResolver {
  const map: Record<string, string | undefined> = {
    supplierA: env.SUPPLIER_A,
    supplierB: env.SUPPLIER_B,
  };

  return (target: string): Address | null => {
    const raw = map[target];
    if (!raw || !isAddress(raw)) return null;
    return getAddress(raw).toLowerCase() as Address;
  };
}
