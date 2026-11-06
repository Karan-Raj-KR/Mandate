# Demo script (about 4 minutes)

Setup once: fill `.env`, `pnpm service` in one terminal, `pnpm --filter @mandate/agents start` in another, `pnpm --filter @mandate/dashboard dev` (live mode) in a third. Keep `pnpm seed` ready to reset. If the service wallet is low on USDC, use `DEMO_AMOUNT=0.25`.

**1. The problem (30s).** A payment service gets a request from an agent three hops from the human who owns the money. It has only the agent's claim. Four questions have no answer today: provenance, amplification, revocation, possession.

**2. Valid execution (40s).** `pnpm --filter @mandate/agents demo`. The chain is built across three separate processes, settlement pays, and the dashboard shows the three permits and the Etherscan link. Point at: the service verified the chain itself.

**3. A prompt-injected agent (60s).** Show `fixtures/invoices/malicious.txt` (the hidden notice). Then `ROGUE=1` procurement and `pnpm --filter @mandate/agents demo rogue`: the signature is genuine, the service rejects it with **actions, maxAmount and targets** named on edge 2, and the balance is unchanged. Say plainly that the OpenAI models we tried did not follow the injection, so the rogue agent stands in for a successful one; the point is that the boundary holds whatever the model decides.

**4. Revocation (40s).** `pnpm attack:revoke`. One transaction, one bytes32, on Sepolia. The same request with a fresh nonce is now `REVOKED`, not replay. Nobody downstream was touched.

**5. Discovery from a name (50s).** `pnpm --filter @mandate/cli verify settle.procure.ops.treasury.mandate-agents.eth`. From the ENS name alone it reads the text records, fetches each delegation, re-verifies every hop and reads revocation from Ethereum. Then the dashboard's Authority Explorer: only genuinely usable authority from Arkiv is shown as active; after step 4 the whole tree flips to denied.

**6. Why this is different (20s).** Capability attenuation is solved for onchain execution. It is not solved for what agents mostly do: call an API. Mandate is attenuated delegation for off-chain resource boundaries, with cross-organisation revocation and no operator to trust.

Order caveat: run step 4 last, because it revokes the seeded root. `pnpm seed` makes a new one.
