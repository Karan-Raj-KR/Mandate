# Demo script (about 3:20, the upload limit is 4:00)

Setup once: fill `.env`, stop anything on ports 3000 and 4000, then run `pnpm demo`. It starts the service and dashboard and publishes a fresh chain to Arkiv and ENS. Wait for "Ready", then open http://localhost:3000. Record the screen with your own voice, at 720p or higher. No phone recording, AI voiceover or speeding up.

**1. The problem (20s).** A payment service gets a request from an agent three hops from the human who owns the money. It has only the agent's claim. It can't tell where that authority came from, whether it grew along the way, or whether it was revoked.

**2. Valid execution (35s).** Press **Valid payment**. The dashboard shows the three permits and the receipt. Point at: the service verified the chain itself. Say that payments in this run are simulated; the checks are real.

**3. A compromised agent (50s).** Show `fixtures/invoices/malicious.txt` (the hidden notice). Press **Rogue amplification**: the signature is genuine, the service rejects it with **actions, maxAmount and targets** named on the edge, and the balance is unchanged. Say plainly that the OpenAI models we tried did not follow the injection, so a scripted rogue agent stands in for a successful one; the point is that the boundary holds whatever the model decides.

**4. Discovery from a name (45s).** In a terminal, run `pnpm --filter @mandate/cli verify settle.procure.ops.treasury.mandate-agents.eth`. From the ENS name alone it reads the text records, fetches each delegation from Arkiv, re-verifies every hop and reads revocation from Ethereum. Then open the Registry page: authority read from Arkiv, all usable.

**5. Revocation (35s).** Press **Revoke the root**. One transaction, one bytes32, on Sepolia. Run the same request again: it is now `REVOKED`, not replay. Refresh the Registry page: the whole tree flips to denied, and nobody downstream was touched.

**6. Why this is different (15s).** Capability attenuation is solved for onchain execution. It is not solved for what agents mostly do: call an API. Mandate is attenuated delegation for off-chain resource boundaries, with cross-organisation revocation and no operator to trust.

Order matters: revoke comes after `verify`, because it kills the published chain. **Press Reset the demo when you finish**, or judges will find a revoked chain. Reset publishes a new chain to Arkiv and ENS.

Optional step-up beat, only if you have time left: press **Large payment** (denied: needs a human), then **Bypass World ID (demo only)**. Say out loud that this is the demo bypass and not a World ID approval; the receipt is stamped `demo-bypass`.

## Demo mode (no USDC needed)

`pnpm service:demo` starts the payment service with `DEMO_MODE=1`, which turns on two things:

- **Simulated payments.** The transfer is replaced by an in-memory ledger (starts at 1,000,000 USDC) and a made-up tx hash. No USDC moves and nothing is sent to a chain. The receipt says `"simulated": true`, and the dashboard shows "Simulated payment · no on-chain transfer" instead of an Etherscan link.
- **The World ID bypass.** Above-threshold payments can be approved with the labelled bypass button. Receipts say `demo-bypass`, never `world-id`.

What is still real: signature checks, the attenuation check, expiry, nonces, and the revocation read from the deployed Sepolia registry. So the amplification attack is denied by the real verifier, and `pnpm attack:revoke` is a real on-chain revoke (it needs a little Sepolia ETH in `OWNER_PK`, not USDC). Say out loud in the pitch that payments are simulated; the dashboard already labels them.

The flags also work separately: `SIMULATE=1` for fake money only, `WORLD_DEMO_BYPASS=1` for the bypass only. Restarting the service resets the simulated balance.
