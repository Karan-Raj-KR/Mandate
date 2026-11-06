# Arkiv friction log

Running notes on what surprised us while integrating `@arkiv-network/sdk`. Newest at the bottom.
Everything here was read from live docs on 2026-11-06 unless marked otherwise.

| # | Where | What happened | Impact |
|---|---|---|---|
| 1 | docs.arkiv.network/start-here/installation/ | Page is only a redirect notice to `/start-here/first-entity/`. The npm package name is not on the landing page (hub.arkiv.network) either; it only appears in the first-entity page (`@arkiv-network/sdk`, plus `viem`). | Two extra hops to find the install command. |
| 2 | hub.arkiv.network/ai-tools | Lists an "AI Plugin", "MCP", "Skills" and "npm Tools" as available, but the page gives no MCP URL, command or tool names. The docs `llms.txt` index has no MCP page and no ETHGlobal Mumbai event guide either. The URL (`https://mcp.arkiv.network/mumbai`) only reached us by word of mouth. | We nearly built from the docs alone without ever finding the MCP. Link it from the ai-tools page. |
| 2b | mcp.arkiv.network/mumbai | Works as plain JSON-RPC over HTTP with no session id, which is handy for scripts. `prompts/get` for `prepare_mumbai` rejects `track: "arkiv"` with "Read get_workflow inputSchema for allowed values", and the error doesn't list the allowed values. | Needed a second call to find valid values. Put the allowed values in the error. |
| 3 | SDK / chain config | Writes and reads go through `rabdi({ accessKey })`. Without a key the chain falls back to a heavily rate-limited public RPC and logs a warning. The key is issued at hub.arkiv.network/access-keys. | An extra signup step before any code works. Needs a human. |
| 4 | Network naming | The testnet is called "Rabdi DB-Chain" (chain id 7794095). Our SPEC says "Arkiv testnet". The SDK helper is `rabdi`, and the API reference also lists `tiramisu` and `localhost`. | Naming drift between spec, docs and code. |
| 5 | Schema API | Entities are written against a named schema via `defineSchema("name", {...})`, not free-form attributes. Other projects write to the same database, so the schema name must be unique, and queries must filter by trusted owner (`ownedBy`) to be safe. | Our `id`, `parentId`, `issuer` etc. need a column each; schema name must be namespaced (we use `mandate.delegation`). |
| 6 | Column types | No array or JSON column. Only bool, i32, u64, u256, dec, str, addr, key, bytes. `str` is capped at 128 bytes; `bytes` (128 KiB) cannot be filtered on. | `actions` and `targets` have to be joined into a string for filtering. The full signed delegation goes in a `bytes` column. |
| 7 | Numeric typing | A bare JS number is `i32` and a bare `5n` is `u256`. A `u64` column needs `u64(5n)` explicitly. `dec(0.1)` throws; decimals are passed as strings. | Easy to get wrong with unix-second expiries; wrap with `u64()`. |
| 8 | Attribute limits | 32 attributes per entity, only 31 for a named schema. | Small, but worth knowing before adding columns. |
| 9 | Update API | There is no `updateEntity`. Changes go through `patchEntity`, `changeOwnership` and `deleteEntity`. | Delegations are immutable for us, so revocation lives on Ethereum, not in Arkiv. |
| 10 | Expiration | Lifetime is set with `ExpirationTime` (not "ttl"), capped at 7,884,000 blocks (about 182.5 days). | Fine for 24h delegations. We still re-check expiry cryptographically. |
| 11 | Docs fetching | The docs site returns HTTP 403 to some automated fetches (e.g. `/start-here/`). The `llms.txt` index works. | Agents need `llms.txt`; the HTML pages are not reliably readable. |
| 12 | TypeScript + `defineSchema` | Exporting a schema from a package with `declaration: true` fails with `TS4023: Exported variable has or is using name 'ColumnProperties' from external module ... but cannot be named`. `ColumnProperties` is not exported from the SDK entry points. | Had to turn off declaration emit for our package. Export `ColumnProperties` (or the schema type) so schemas can be exported from libraries and monorepo packages. |
| 13 | Faucet | The faucet (hub.arkiv.network/faucet) is titled "Get tGLM" and needs a connected browser wallet. Nothing on the page or the docs we read says that tGLM is the gas token on Rabdi, how much a claim gives, or the cooldown length ("one claim per wallet, per cooldown window"). Without JavaScript it shows only "Loading…". | A server-side or scripted writer (ours is a plain private key) cannot use it directly: we had to make the writer a wallet that exists in a browser extension. Accept an address input, or document the amount and cooldown. |
| 14 | MCP `check_schema` and `check_submission` | Both run a "shallow text check" and report `no blockers`, but explicitly do not certify anything. They accept free text only, so they cannot check a real `defineSchema` file. | Useful as a lint, but we could not use them to validate our actual schema code. A tool that takes the schema source would catch type and index mistakes before spending gas. |
| 15 | Unknown filter semantics | We index `maxAmount` as `u256` (USDC minor units). The docs show `eq`/`gt` examples only on `str` and `dec` columns, so we cannot tell from the docs whether `gt("maxAmount", ...)` works on `u256`. | We do not rely on it: we filter on `rootId` and `id` and verify amounts locally. |

## Open items

- Does `eq()` / `gt()` work on `u256` columns (for `maxAmount`)? Docs show filters on `str` and `dec` only. Still untested; we do not rely on it.
- **Answered:** write cost is about 0.0002 tGLM per entity (3 entities for 0.0007 tGLM), so a faucet claim of 10 tGLM covers thousands of writes.
- **Answered:** an entity was returned by the first query issued after `createEntity` resolved, so we saw no indexing delay.
