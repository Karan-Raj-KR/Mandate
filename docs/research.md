# Phase 2 research notes

Fetched 2026-11-06 from live docs. Every address below must still be **confirmed on-chain** (`eth_getCode`, `symbol()`) before first use. The doc pages were read through a summarising fetcher, so a transcription error is possible.

## Sepolia USDC (the payment asset)

- Source: https://developers.circle.com/stablecoins/usdc-contract-addresses
- Ethereum Sepolia USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Testnet funds: Circle faucet (https://faucet.circle.com), link not on the address page; confirm before relying on it.
- Check on-chain: `symbol() == "USDC"`, `decimals() == 6`.

## ENS (Sepolia is ENSv2)

- Source: https://docs.ens.domains/learn/deployments, section "Sepolia (ENSv2)".
- The same page marks the ENSv1 Sepolia contracts as "Legacy ... no longer in use", and https://docs.ens.domains/registry/eth says new `.eth` registrations through the v1 controllers are permanently disabled. **So the SPEC's use of ENSv2 on Sepolia matches the docs.** Whether `dhruv.eth` / `treasury.dhruv.eth` exist there is unverified and needs an RPC.
- Contracts we expect to touch (from the ENSv2 table):
  - ETHRegistrar `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3`
  - ETHRegistry `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4`
  - UniversalResolverV2 `0x24e1d8e068620b647ca097f961a61055f4f42d72`
  - PublicResolverV2 `0xdc4a563d00f5c3012b699794eb9e13a561be386f`
  - VerifiableFactory `0xda70306c98e97ece36f997a21368e53298572991`
  - MockUSDC `0x240b0316df57887dbbe58b586508b19e633a14aa`, MockDAI `0xf6fac8a58a0be13b9197f27c41b73162fe32572b` (ENS's own registrar payment tokens, not Circle's USDC)
- Registration (https://docs.ens.domains/ensv2/eth-registrar): `isAvailable(label)` → `getRegisterPrice(label, duration, paymentToken)` → approve ERC20 → `makeCommitment(label, owner, secret, subregistry, resolver, duration, referrer)` → `commit` → wait ≥60s → `register(...)`. Payment is **ERC20 only, not ETH**. The page has no Sepolia notes, so how to get the payment token on Sepolia is open.
- Records (https://docs.ens.domains/ensv2/permissioned-resolver): each account deploys its own PermissionedResolver via the VerifiableFactory (UUPS proxy), then points the name at it with `setResolver`. `setText(bytes dnsEncodedName, string key, string value)`, and `multicall(bytes[] calls)` batches several writes in one tx. Needs `ROLE_SET_TEXT` on the root resource or per key.
- Reads: viem `getEnsText` works unchanged through the Universal Resolver, but needs viem ≥ 2.35.0. The repo has viem 2.57.16.
- Subnames (https://docs.ens.domains/ensv2/subnames): two models. (1) Records only: set a resolver on the parent and write records for full names (e.g. `settle.procure.ops.treasury.dhruv.eth`) into it, resolved by wildcard (ENSIP-10); no tokens and no per-agent ownership. (2) UserRegistry with real subname tokens. **Plan: model 1**, because one registration plus one multicall is the cheapest path to the CLI demo.
- ensjs alternative: `setRecords` from `@ensdomains/ensjs/wallet/v2` takes a `texts: [{key, value}]` array. Not needed if we use viem + the resolver ABI directly.

## Arkiv

- Package: `@arkiv-network/sdk` (+ `viem`). Chain: `rabdi({ accessKey })` from `@arkiv-network/sdk/chains`. Network id 7794095, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, explorer https://rabdi.explorer.arkiv.network.
- Write: `walletClient.createEntity(Schema, {...attrs}, { expiration: ExpirationTime.fromDays(1) })`. Read: `publicClient.select({...}).from(Schema).where(and(eq(..), gt(..))).ownedBy(addr).fetch()`.
- Limits: `str` 128 bytes, `bytes` 128 KiB (not filterable), 31 attributes on a named schema, 100 rows per page. No arrays/JSON columns.
- **Needs a human:** an access key from https://hub.arkiv.network/access-keys, and a funded Rabdi wallet.
- Details and surprises: `arkiv/friction.md`.

## World ID

- Source: https://docs.world.org/world-id/overview and https://docs.world.org/world-id/idkit/integrate.md
- Client: `@worldcoin/idkit` (React), `IDKitRequestWidget` with `app_id`, `action`, `rp_context`.
- Server verify: `POST https://developer.world.org/api/v4/verify/{rp_id}`, forwarding the IDKit result payload unchanged; accept only if `success: true` **and** `environment` equals the value we expect. Store the nullifier to stop reuse.
- Binding to a request: use the proof's `signal` (set client side, enforced server side). For step-up approval the signal must be the request digest.
- `rp_context` must be signed on our backend with a `signing_key`; never expose it client-side.
- Testing: simulator at https://simulator.worldcoin.org/ with `environment: "staging"`.
- **Needs a human:** a Developer Portal account giving `app_id`, `rp_id`, `signing_key`.

## viem nested EIP-712 / Foundry

- Already implemented and tested in the repo (`packages/core/src/canonical.ts`, 26 tests, `string[]` in typed data). Not re-researched.
- Foundry 1.9.0 installed. `forge-std` installed into `packages/contracts/lib` with `forge install --no-git` (the folder is gitignored). `forge test` runs: 11 of 11 registry tests pass.

## What still needs a human

1. Sepolia RPC URL (Alchemy / Infura / similar free tier). Etherscan API key (free account at etherscan.io, only needed for `--verify`).
2. Funded Sepolia keys: a deployer/owner, plus the service key holding Sepolia USDC.
3. Arkiv access key and a funded Rabdi wallet.
4. World Developer Portal app (`app_id`, `rp_id`, `signing_key`).
5. `ADDENDUM_v3.md` (not in the repo).
