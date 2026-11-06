# Mandate

**Agents can subcontract work. Authority must not expand.**

Mandate is an execution authorization layer for AI agents. When agents delegate to other agents, every hop carries a signed, provably narrower slice of authority, and the service that owns the asset verifies the whole chain before acting. Revocation lives on Ethereum, discovery on ENS, and a queryable record of delegated authority on Arkiv. Built at ETHGlobal Mumbai 2026. Behaviour, formats and security rules: [SPEC.md](SPEC.md).

```
Owner ─▶ ops ─▶ procurement (LLM, reads invoices) ─▶ settlement ─▶ POST /execute  ◀─ the enforcement boundary
 ≤$500     ≤$100, A/B           ≤$25, supplierA                     verifies chain + request, then pays
```

## What it does (all of this runs today)

- **Valid payment executes.** Settlement pays supplierA through the payment service, which verifies the chain and the request, then sends Sepolia USDC.
- **Amplification is denied, with no side effect.** A delegation that widens actions, amount or targets is rejected with every violation named on the offending edge, and the balance does not change.
- **Revoking an ancestor denies a previously valid request.** One transaction on the registry, a fresh nonce, `REVOKED` (not replay).
- **Step-up above $15** needs a World ID approval bound to that exact request. Not configured means denied. For demos without a verified human, `WORLD_DEMO_BYPASS=1` adds a clearly labelled **demo bypass** (a dashboard button) that replaces only that step, is stamped `demo-bypass` in the receipt and history, and never overrides the chain, scope, revocation or replay checks.
- **Discovery from an ENS name.** `pnpm --filter @mandate/cli verify settle.procure.ops.treasury.mandate-agents.eth` rebuilds and verifies the three-hop chain.

Evidence from a live Sepolia run, with transaction links: [docs/milestone-run.md](docs/milestone-run.md).

## Deployments (Sepolia, chain 11155111)

| Item | Address / name |
|---|---|
| RevocationRegistry | [`0x6813Aa2574392530b7f1b3C5ed0683d30133FE98`](https://sepolia.etherscan.io/address/0x6813Aa2574392530b7f1b3C5ed0683d30133FE98#code) (verified) |
| Root issuer (owner) | `0xD58Db2d84b2B0BDaE9e681A0d4Ff8b7b4A06d636` |
| Payment asset | Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| ENS root name (ENSv2) | `mandate-agents.eth`, per-account PermissionedResolver `0x55a536698C216b4d4802c3c7704dDb0Da47Bd865` |
| Arkiv writer (Rabdi testnet, chain 7794095) | `0xD58Db2d84b2B0BDaE9e681A0d4Ff8b7b4A06d636` |

Arkiv schema, owners and expiry: [arkiv/schema.md](arkiv/schema.md). Query you can run against our data:

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { DelegationSchema } from "./packages/arkiv/src/schema.ts";

const client = createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY! }), transport: http() });
const { entities } = await client
  .select({ $key: true, id: true, issuer: true, subject: true, actions: true, maxAmount: true, expiry: true })
  .from(DelegationSchema)
  .ownedBy("0xD58Db2d84b2B0BDaE9e681A0d4Ff8b7b4A06d636")
  .where(eq("actions", "payment.transfer"))
  .fetch();
```

## Run it

Needs Node 22+, pnpm, and Foundry for the contracts. Copy `.env.example` to `.env` and fill it in (keys never go in git).

```bash
pnpm install
pnpm test                                   # all TypeScript tests
cd packages/contracts && forge test         # registry tests
pnpm service                                # payment service on :4000 (real USDC)
pnpm service:demo                           # no-money demo: simulated payments + labelled World ID bypass
pnpm seed && pnpm pay 0.5 supplierA         # valid execution
pnpm attack:amplify                         # denied, balance unchanged
pnpm attack:replay                          # one debit, second send REPLAY
pnpm attack:revoke                          # revoke the root, then REVOKED   (run last; `pnpm seed` resets)

pnpm --filter @mandate/agents start         # operations, procurement, settlement as separate processes
pnpm --filter @mandate/agents demo          # honest chain, paid through the service
pnpm --filter @mandate/agents demo llm malicious   # LLM agent reads a poisoned invoice
pnpm --filter @mandate/dashboard dev        # dashboard (set NEXT_PUBLIC_SERVICE_URL for live mode)
```

## Layout

| Path | What |
|---|---|
| `packages/core` | types, `narrows`, EIP-712 canonical + signing, chain verification, config, tests (unit, property, attack) |
| `packages/contracts` | `RevocationRegistry.sol`, Foundry tests, deploy script |
| `packages/payment-service` | `POST /execute`, the enforcement boundary, plus `/requests` history and World ID step-up |
| `packages/agents` | operations, procurement (LLM), settlement and a rogue variant, each its own process |
| `packages/arkiv` | Arkiv schema, publisher, and an Authority Explorer that re-verifies everything it reads |
| `packages/cli` | ENS registration, text records, and `verify <ens-name>` |
| `packages/dashboard` | chain view, decision timeline, attack controls |
| `arkiv/`, `docs/`, `fixtures/` | Arkiv track files, notes and measurements, sample invoices |

## Honest limits

- World ID is built and tested but has not been run against World's live API (none of the team has a verified World ID). The step-up demo uses the labelled demo bypass. Never enable `WORLD_DEMO_BYPASS` outside a demo.
- `maxAmount` is per execution, not a budget. Replay protection is in memory. The payment adapter is backend-controlled.
- The two current OpenAI models we tried did not fall for the poisoned invoice (0 of 12 runs). The attack is demonstrated with a scripted rogue agent, and the service stops it. See [docs/llm-agent.md](docs/llm-agent.md).
- `dhruv.eth` already belongs to someone else on Sepolia, so the spec's names are replaced by `mandate-agents.eth` ([docs/ens.md](docs/ens.md)).
- More in [SPEC.md](SPEC.md) section 12.

## AI usage

AI coding tools (Claude Code, and a coding agent for the contracts) wrote most of this code under human direction and review. Every AI-assisted file is listed in [AI/AI_USAGE.md](AI/AI_USAGE.md), and the key prompts in [AI/Prompts.md](AI/Prompts.md). The procurement agent calls an OpenAI model at runtime.

## License

[MIT](LICENSE)
