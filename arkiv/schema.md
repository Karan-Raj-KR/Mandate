# Arkiv schema

Schema name: `mandate.delegation` (defined in [`packages/arkiv/src/schema.ts`](../packages/arkiv/src/schema.ts)). One entity per signed delegation.

| Column | Type | Indexed | What it is |
|---|---|---|---|
| `id` | str | yes | EIP-712 digest of the delegation (its identity) |
| `parentId` | str | yes | id of the parent delegation, all zeros for the root |
| `rootId` | str | yes | id of the root of this chain, so one query returns a whole tree |
| `issuer` | addr | yes | who signed it |
| `subject` | addr | yes | the agent receiving authority |
| `actions` | str | yes | comma-joined, sorted, e.g. `invoice.read,payment.transfer` (Arkiv has no array column) |
| `maxAmount` | u256 | yes | per-execution ceiling, USDC minor units (6 dp) |
| `expiry` | u64 | yes | unix seconds |
| `targets` | str | yes | comma-joined, sorted, or `*` |
| `depth` | i32 | yes | 0 for the root |
| `payload` | bytes | no | the full signed delegation as JSON; this is what gets re-verified |

**Fields we query on:** `rootId` (the Authority Explorer: "everything under this root"), `id` (the CLI follows `parent-id` links one delegation at a time), `issuer` / `subject` / `actions` (counterparty lookups).

**Who owns each entity:** the writer wallet in the README, `0xc0afa1Fb169b523CBd7a2878eCEd1F7E664FfE28`. The spec has each issuer own its own entities; we use one publisher to avoid funding every agent wallet on a faucet (see `how-you-use-arkiv.md`). Ownership is not what makes the data trustworthy: reads filter on a trusted owner, and then **everything is re-verified locally** (id recomputed, signature recovered, every edge checked with the same `narrows` code the payment service uses, expiry re-checked, revocation read from Ethereum).

**When each entity expires:** at the delegation's own `expiry` (`ExpirationTime.atDate`). Delegations are immutable: there is no patch. Revocation is not stored in Arkiv; it lives in the Ethereum registry, because it has to be shared state that a service reads at the moment of execution.

**Limits we hit by design:** string columns hold 128 bytes, so a `targets` list that does not fit is refused at publish time (with a test), not truncated.

**Query to run:** see the README, or `pnpm --filter @mandate/arkiv explore <root-delegation-id>`.
