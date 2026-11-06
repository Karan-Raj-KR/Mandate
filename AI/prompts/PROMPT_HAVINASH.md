# Havinash — checkpoint plan

Branch: `havinash/mvp`. Owns: `packages/contracts/**`,
`packages/core/src/{canonical,sign,verify,registry}.ts`,
`packages/core/test/{canonical,verify,attacks}.test.ts`.
Read `AGENTS.md` and `SPEC.md` before each checkpoint. Foundry only
(`forge init --no-git`, `forge install --no-git`) — no git submodules,
never touch `package.json` or the lockfile.

## Checkpoint 1 — pull scaffold

- `git merge origin/main` to pick up `types.ts`, `config.ts`, and the
  rest of the scaffold once Karan pushes it.
- `packages/contracts/`: Foundry project init.

## Checkpoint 2 — RevocationRegistry

- `packages/contracts/src/RevocationRegistry.sol` exactly as in SPEC §7:
  per-issuer namespace, `revoke(id)`, `anyRevoked`, `statusOf`, O(1) write /
  O(chain depth) read, no descendant enumeration.
- Foundry tests: own-namespace revoke, cross-issuer isolation, double-revoke
  reverts, `anyRevoked`/`statusOf` length-mismatch revert.

## Checkpoint 3 — canonical + sign

- `packages/core/src/canonical.ts`: EIP-712 typed-data shapes for `Delegation`
  and `ExecutionRequest` (SPEC §5), using viem's `hashTypedData` with native
  `string[]` types (so `["a,b"]` and `["a","b"]` never collide). Domain
  `chainId`/`verifyingContract` always from `VerifierConfig`, never from a token.
- `packages/core/src/sign.ts`: sign a delegation (issuer key) / sign an
  execution request (final subject key) with viem.
- `packages/core/test/canonical.test.ts`: id recomputation, signature
  round-trip, string-array collision case.

## Checkpoint 4 — verify

- `packages/core/src/verify.ts`: the full local-check pipeline, SPEC §6 steps
  1–13 — schema/bounds/version, chain depth ≤ 8, root issuer pinned from
  config, id recomputed per delegation, every issuer signature valid, parent
  link, issuer-link, `narrows()` on every edge (use Karan's `checkAllEdges`),
  nothing expired, deadline valid, audience match, request signature,
  in-scope action/amount/target, step-up threshold.
- `packages/core/src/registry.ts`: viem RPC client wrapping
  `RevocationRegistry.anyRevoked`/`statusOf` — any RPC failure or stale read
  denies (SPEC §6 step 15), never throws past the caller.

## Checkpoint 5 — security tests

- `packages/core/test/verify.test.ts`: every named failure mode works —
  wrong root, wrong chainId, wrong registry, mutated payload, bad signature,
  broken parent link, issuer ≠ parent's subject, expired ancestor, revoked
  root/intermediate, registry read failure, stale state.
- `packages/core/test/attacks.test.ts`: wrong final-agent key, recipient/amount
  changed after signing, wrong audience, replayed nonce, concurrent same-nonce
  (exactly one succeeds), human approval never validates an out-of-scope
  request. Every denial case asserts no side effect / balance unchanged.

## Checkpoint 6 — deploy + integration

- Deploy `RevocationRegistry` to Sepolia; fill the deployments row in
  `README.md` (append-only, don't touch Karan's rows).
- Add export lines in `packages/core/src/index.ts` for `canonical`, `sign`,
  `verify`, `registry` once they land.
- Open PR `havinash/mvp` → `main` first at integration time (~18:30), ahead
  of Karan's merge.

## Notes

- Fail closed everywhere: missing env var, RPC failure, malformed input = deny.
- Equality is valid attenuation — use `>`, never `>=`, when comparing against
  a parent's ceiling/expiry.
- Log every new AI-touched file in `AI/AI_USAGE.md` in the same commit.
