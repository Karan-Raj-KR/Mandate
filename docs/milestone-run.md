# Milestone run on Sepolia

Run on 2026-11-06 against the deployed `RevocationRegistry` and Circle's Sepolia USDC, with the real payment service (`SIMULATE` off). The demo amount was 0.5 USDC (`DEMO_AMOUNT=0.5`) because the faucet gives 1 USDC per claim.

| Step | Result | Evidence |
|---|---|---|
| Deploy registry | verified on Etherscan | [`0xbf0e…0ce2`](https://sepolia.etherscan.io/tx/0xbf0e1aa5ede3a0a51b3dd6426a728ed90ac0712558c9774b639951110d6c0ce2), [contract](https://sepolia.etherscan.io/address/0x6813Aa2574392530b7f1b3C5ed0683d30133FE98#code) |
| 1. Valid execution, settle → supplierA, 0.5 USDC | HTTP 200, tx succeeded, supplierA balance 0.5 USDC, service 2.0 → 1.5 | [`0xa19a…4a55`](https://sepolia.etherscan.io/tx/0xa19a707be491c28b6e767de9bb2fb9a70282562d5d4f6b9fe234a6ce32e64a55) |
| 2. Prompt-injected amplification | HTTP 403, `actions`, `maxAmount`, `targets` named on edge 2. Service balance 1.5 before and after. | no transaction |
| Replay (same nonce twice) | first 200, second 403 `REPLAY`. Exactly one debit (1.5 → 1.0). | [`0x7009…96af`](https://sepolia.etherscan.io/tx/0x7009547dac7aa338cc088e7fff7b77e7657d64068c749e8a8e57341c0d2096af) |
| 3. Owner revokes root, request resent with a fresh nonce | HTTP 403 `REVOKED`. Service balance 1.0 before and after. | [`0x3625…e97f`](https://sepolia.etherscan.io/tx/0x3625756ad8e15865c209c492b06ad6fa193e1ac296af879014d8fb32414fe97f) |

Reproduce: fill `.env` from `.env.example`, run `pnpm service`, then `pnpm seed`, `pnpm pay 0.5 supplierA`, `pnpm attack:amplify`, `pnpm attack:replay`, `pnpm attack:revoke` (revoke last: it invalidates the seeded chain; run `pnpm seed` again to reset).
