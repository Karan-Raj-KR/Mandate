# ENS on Sepolia

Sepolia runs ENSv2 (see `docs/research.md`). What we found and did on 2026-11-06:

- **`dhruv.eth` already exists on Sepolia** and resolves to `0x6Bb854a95932Dd5A38bCD784E22eca09a2cB4f10`, which is not one of our wallets. The SPEC's `treasury.dhruv.eth` therefore is not ours to write to.
- We registered **`mandate-agents.eth`** instead (1 year, 8 MockUSDC, ENS's own Sepolia test token, which any address can mint). Agent names hang off it: `treasury.mandate-agents.eth` (owner), `ops.treasury…`, `procure.ops.treasury…`, `settle.procure.ops.treasury…`.
- The name uses a **per-account PermissionedResolver** (`ENS_RESOLVER` in `.env`), deployed through the VerifiableFactory with our owner holding `ROLE_SET_TEXT`. One instance holds text records for every agent subname by wildcard resolution (ENSIP-10), so the subnames need no tokens of their own.
- The five `mandate:*` records for all four names (17 records) are written in **one `multicall`** transaction (`pnpm --filter @mandate/cli publish-records`).
- Reads need nothing special: a plain viem `getEnsText({ name, key })` on the deepest name returns the records.
- Registration needed the exact ABI. The docs list function names only, so the ABIs come from the contracts' verified sources on Etherscan.

Commands: `pnpm --filter @mandate/cli register-ens [label]` (one time), `pnpm seed && pnpm --filter @mandate/cli publish-records`, then `pnpm --filter @mandate/cli verify settle.procure.ops.treasury.mandate-agents.eth [--from-file]`.

The CLI treats the name as an entry point only. It refuses a name whose `mandate:registry` differs from our configured registry, and a name whose `mandate:subject` differs from the delegation's subject. Everything fetched is re-verified before it is called usable.
