// SPEC §7 — RevocationRegistry, the slice this scripts/** needs client-side.
export const revocationRegistryAbi = [
  {
    type: "function",
    name: "revoke",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
] as const;
