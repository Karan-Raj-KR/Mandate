# Karan — checkpoint plan

Branch: `karan/mvp`. Owns: root scaffold/config files, `packages/core/src/{types,config,schema,narrow,index}.ts`,
`packages/core/test/{narrow,narrow.property,schema}.test.ts`, `packages/payment-service/**`, `scripts/**`.
Read `AGENTS.md` and `SPEC.md` before each checkpoint.

## Checkpoint 1 — scaffold + frozen types/config on main

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`
- `packages/core/src/types.ts` (frozen once on `main`), `packages/core/src/config.ts`
- Pushed directly to `main` so Havinash can `git merge origin/main` into his branch.

Status: done (`ab4d5bd`).

## Checkpoint 2 — narrowing invariant

- `packages/core/src/narrow.ts`: `narrows(child, parent)` returning every violation
  (SPEC §4), `checkAllEdges(chain)` for a full delegation chain.
- `packages/core/test/narrow.test.ts`: unit tests for each dimension, the demo chain
  (SPEC §9) passing, the demo attack failing with three named violations.

Status: done, committing now on `karan/mvp`.

## Checkpoint 3 — property tests

- `packages/core/test/narrow.property.test.ts` (fast-check): reflexivity
  (`narrows(A, A) = []`) and transitivity (C narrows B, B narrows A ⇒ C narrows A)
  over randomly generated `Scope`s.

## Checkpoint 4 — runtime schema validation

- `packages/core/src/schema.ts`: zod schemas for `Scope`, `UnsignedDelegation`/`Delegation`,
  `UnsignedRequest`/`ExecutionRequest`, matching `types.ts` exactly (bigint amounts,
  decimal-string transport, hex ids).
- `packages/core/test/schema.test.ts`: valid payloads parse; malformed payloads
  (wrong types, missing fields, bad hex) are rejected — fail closed.

## Checkpoint 5 — payment service (`POST /execute`)

Wire the local checks from SPEC §6 (steps 1–13) using Havinash's `canonical.ts`,
`sign.ts`, `verify.ts`, `registry.ts` once they land (add their export lines in
`packages/core/src/index.ts` — never write his code). Until then, stub the verifier
call to always deny.

- Express app, `POST /execute` route, nonce store (consume atomically, no await
  between check and write), RPC call to `RevocationRegistry.anyRevoked` last.
- `scripts/seed.ts`, `scripts/pay.ts` (`pnpm seed && pnpm pay 10 supplierA`).

## Checkpoint 6 — attack scripts + integration

- `scripts/attack-amplify.ts`, `scripts/attack-revoke.ts`, `scripts/attack-replay.ts`
  (SPEC §9 scenarios 2–3, §10 security tests) — assert no side effect on denial.
- At merge time: Havinash's PR → `main` first, then `git merge origin/main` into
  `karan/mvp`, remove the verifier stub, wire the real chain, open PR.

## Notes

- Fail closed everywhere: missing env var, RPC failure, malformed input = deny.
- EIP-712 `chainId` / `verifyingContract` from `VerifierConfig`, never from a token.
- Log every new AI-touched file in `AI/AI_USAGE.md` in the same commit.
