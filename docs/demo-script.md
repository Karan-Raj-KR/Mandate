# Demo script (about 4 minutes)

Setup once: fill `.env`, `pnpm service` in one terminal, `pnpm --filter @mandate/agents start` in another, `pnpm --filter @mandate/dashboard dev` (live mode) in a third. Keep `pnpm seed` ready to reset. No USDC? Run `pnpm service:demo` instead of `pnpm service` (see "Demo mode" below).

**1. The problem (30s).** A payment service gets a request from an agent three hops from the human who owns the money. It has only the agent's claim. Four questions have no answer today: provenance, amplification, revocation, possession.

**2. Valid execution (40s).** `pnpm --filter @mandate/agents demo`. The chain is built across three separate processes, settlement pays, and the dashboard shows the three permits and the Etherscan link. Point at: the service verified the chain itself.

**3. A prompt-injected agent (60s).** Show `fixtures/invoices/malicious.txt` (the hidden notice). Then `ROGUE=1` procurement and `pnpm --filter @mandate/agents demo rogue`: the signature is genuine, the service rejects it with **actions, maxAmount and targets** named on edge 2, and the balance is unchanged. Say plainly that the OpenAI models we tried did not follow the injection, so the rogue agent stands in for a successful one; the point is that the boundary holds whatever the model decides.

**4. Revocation (40s).** `pnpm attack:revoke`. One transaction, one bytes32, on Sepolia. The same request with a fresh nonce is now `REVOKED`, not replay. Nobody downstream was touched.

**5. Discovery from a name (50s).** `pnpm --filter @mandate/cli verify settle.procure.ops.treasury.mandate-agents.eth`. From the ENS name alone it reads the text records, fetches each delegation, re-verifies every hop and reads revocation from Ethereum. Then the dashboard's Authority Explorer: only genuinely usable authority from Arkiv is shown as active; after step 4 the whole tree flips to denied.

**6. Why this is different (20s).** Capability attenuation is solved for onchain execution. It is not solved for what agents mostly do: call an API. Mandate is attenuated delegation for off-chain resource boundaries, with cross-organisation revocation and no operator to trust.

Optional step-up beat (30s): start the service with `WORLD_DEMO_BYPASS=1`, run `pnpm pay 20 supplierA` (denied: needs a human), then press the dashboard's **Bypass World ID (demo only)** button. Say out loud that this is the demo bypass and not a World ID approval; the receipt is stamped `demo-bypass`.

Order caveat: run step 4 last, because it revokes the seeded root. `pnpm seed` makes a new one.

## Demo mode (no USDC needed)

`pnpm service:demo` starts the payment service with `DEMO_MODE=1`, which turns on two things:

- **Simulated payments.** The transfer is replaced by an in-memory ledger (starts at 1,000,000 USDC) and a made-up tx hash. No USDC moves and nothing is sent to a chain. The receipt says `"simulated": true`, and the dashboard shows "Simulated payment · no on-chain transfer" instead of an Etherscan link.
- **The World ID bypass.** Above-threshold payments can be approved with the labelled bypass button. Receipts say `demo-bypass`, never `world-id`.

What is still real: signature checks, the attenuation check, expiry, nonces, and the revocation read from the deployed Sepolia registry. So the amplification attack is denied by the real verifier, and `pnpm attack:revoke` is a real on-chain revoke (it needs a little Sepolia ETH in `OWNER_PK`, not USDC). Say out loud in the pitch that payments are simulated; the dashboard already labels them.

The flags also work separately: `SIMULATE=1` for fake money only, `WORLD_DEMO_BYPASS=1` for the bypass only. Restarting the service resets the simulated balance.
