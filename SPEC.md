# Mandate

**Agents can subcontract work. Authority must not expand.**

Mandate is an execution authorization layer for AI agents. When agents delegate to other agents, every hop carries a signed, provably narrower slice of authority, and the service that actually owns the asset verifies the whole chain before acting. Revocation lives on Ethereum, discovery on ENS, and a queryable record of delegated authority on Arkiv.

Built from scratch at **ETHGlobal Mumbai 2026**.

---

## 1. The problem

A treasury owner authorises an operations agent. Operations delegates procurement to another agent. Procurement delegates a payment to a settlement agent, which calls a supplier-payment service.

That payment service now receives a request from an agent it has never met, three hops away from the human who owns the money. Today it has only the agent's own claim that it is allowed to act.

At that boundary, four questions have no verifiable answer:

| Question | What can go wrong |
|---|---|
| **Provenance** — does this authority trace back to the real owner? | Anyone can claim to act for a treasury |
| **Amplification** — did scope widen on the way down? | Owner said "≤ $500, approved suppliers"; hop 3 ends up with "any amount, anyone" |
| **Revocation** — the owner revoked an hour ago. Does hop 3 know? | Cancelled authority keeps working downstream |
| **Possession** — is the presenter the agent the authority was issued to? | A copied delegation works like a stolen bearer token |

The risk is concrete now that agents read untrusted input. A procurement agent that reads a supplier invoice can be **prompt-injected** into granting itself, or a downstream agent, far more power than it was given.

## 2. What Mandate guarantees

A Mandate-protected service executes a request only if **all** of these hold:

1. The delegation chain traces back to a **root issuer the service pins in its own config**.
2. **No hop expands** its parent's scope in any dimension.
3. The request is **signed by the key the final delegation was issued to**, binding the exact action, amount, target and deadline.
4. **No delegation in the chain has been revoked**, checked against a shared registry on Ethereum.
5. The request is **fresh and single-use** (per-request nonce, deadline, intended service).

If any check cannot complete — malformed input, RPC failure, stale state — the request is **denied**. Mandate fails closed.

> An agent can sign any delegation it likes. What matters is whether the service accepts it.

## 3. Architecture

```
            Owner (root, pinned by the service)
              │  signs delegation #1  (≤ $500, any supplier, 24h)
              ▼
        ops.treasury.dhruv.eth
              │  signs delegation #2  (≤ $100, supplierA/B, 2h)
              ▼
   procure.ops.treasury.dhruv.eth   ← LLM agent, reads invoices
              │  signs delegation #3  (≤ $25, supplierA, 1h)
              ▼
 settle.procure.ops.treasury.dhruv.eth
              │  signs ExecutionRequest (pay $10 → supplierA)
              ▼
 ┌──────────────────────────────────────────┐
 │  Payment service  —  POST /execute       │   ◄── the enforcement boundary
 │  verifies chain + request, then pays     │
 └──────────────────────────────────────────┘
        │ reads revocations         │ discovery            │ authority records
        ▼                           ▼                      ▼
  RevocationRegistry (Sepolia)     ENS (Sepolia)          Arkiv
```

| Component | Role |
|---|---|
| Signed delegation chain | Provenance and attenuation — works without any blockchain |
| Ethereum `RevocationRegistry` | Shared revocation state across organisations |
| ENS | Each agent is a name; text records point to its delegation — the discovery entry point |
| Arkiv | Queryable, owner-held distribution of full signed delegations |
| World ID | Assurance that a unique human holds the root; fresh human approval for higher-value requests |

## 4. Permission model

Each delegation carries exactly four caveats:

```ts
type Scope = {
  actions:   string[];   // e.g. ["invoice.read", "payment.transfer"], sorted + deduped
  maxAmount: bigint;     // per-execution ceiling, USDC minor units (6 dp)
  expiry:    number;     // absolute unix seconds
  targets:   string[];   // exactly ["*"] or a set of concrete ids, never both
};
```

`maxAmount` is a **per-execution ceiling**, not a budget. Aggregate budgets require shared atomic accounting across sibling agents and are out of scope.

### The invariant

> **A child's scope must not expand its parent's scope in any dimension.**

Equality is allowed: authority is non-expanding, not strictly shrinking. The check returns *every* violation, not the first, so the service can explain exactly how a delegation amplified.

```ts
// packages/core/src/narrow.ts
export function narrows(child: Scope, parent: Scope): NarrowFailure[] {
  const f: NarrowFailure[] = [];

  const p = new Set(parent.actions);
  const escalated = child.actions.filter(a => !p.has(a));
  if (escalated.length) f.push({ dimension: "actions",
    reason: `claims action(s) the parent never held: ${escalated.join(", ")}`,
    parentValue: parent.actions.join(", "), childValue: child.actions.join(", ") });

  if (child.maxAmount > parent.maxAmount) f.push({ dimension: "maxAmount",
    reason: "per-execution ceiling exceeds parent's",
    parentValue: parent.maxAmount.toString(), childValue: child.maxAmount.toString() });

  if (child.expiry > parent.expiry) f.push({ dimension: "expiry",
    reason: "outlives parent", parentValue: String(parent.expiry), childValue: String(child.expiry) });

  if (!parent.targets.includes("*")) {
    if (child.targets.includes("*")) {
      f.push({ dimension: "targets", reason: "claims unrestricted targets from a restricted parent",
        parentValue: parent.targets.join(", "), childValue: "*" });
    } else {
      const pt = new Set(parent.targets);
      const bad = child.targets.filter(t => !pt.has(t));
      if (bad.length) f.push({ dimension: "targets",
        reason: `claims target(s) outside parent's set: ${bad.join(", ")}`,
        parentValue: parent.targets.join(", "), childValue: child.targets.join(", ") });
    }
  }
  return f;
}
```

Beyond unit tests, the invariant is checked with property-based tests (`fast-check`): **reflexivity** (`narrows(A, A) = []`) and **transitivity** (if C narrows B and B narrows A, then C narrows A).

## 5. Formats

All signatures are **EIP-712** typed data, hashed with viem's `hashTypedData` using native `string[]` types, so `["a,b"]` and `["a","b"]` cannot collide.

### Delegation

```ts
type Delegation = {
  v: 1;
  id: Hex;             // EIP-712 digest of all fields except id and sig
  parent: Hex;         // 0x00…00 for the root
  issuer: Address;
  subject: Address;    // the agent receiving authority
  issuerName: string;  // ENS name
  subjectName: string; // ENS name
  scope: Scope;
  nonce: Hex;          // uniqueness of this grant
  sig: Hex;            // signed by issuer
};
```

### Execution request

A delegation chain alone would be a bearer token: anyone holding a copy could present it. Every execution therefore requires a request signed by the final agent's key.

```ts
type ExecutionRequest = {
  leafId: Hex;       // final delegation in the chain
  audience: string;  // the service this request is for
  action: string;
  amount: bigint;
  target: string;
  nonce: Hex;        // single-use: replay protection lives here
  deadline: bigint;  // unix seconds
  sig: Hex;          // signed by the final delegation's subject
};
```

### Signing domain

```ts
const DOMAIN = {
  name: "Mandate", version: "1",
  chainId: CONFIG.chainId,             // from the service's config, never from the token
  verifyingContract: CONFIG.registry,  // from the service's config, never from the token
};
```

## 6. The enforcement boundary

Enforcement happens at the service that owns the asset, before any side effect. An agent-side SDK is not enforcement: a malicious agent simply skips it.

```
POST /execute

Local checks (no network)
  1.  schema, bounds, version valid
  2.  chain non-empty, depth ≤ 8, first delegation is a root
  3.  root issuer === the service's pinned root issuer
  4.  every id recomputed from its payload
  5.  every issuer signature valid
  6.  each delegation's parent === previous delegation's id
  7.  each delegation's issuer === previous delegation's subject
  8.  narrows() holds on every edge  (all violations returned, with edge index)
  9.  nothing expired; request deadline valid and short-lived
  10. request.audience === this service
  11. request signed by the final delegation's subject
  12. requested action, amount and target within the final scope
  13. above the approval threshold → valid World ID approval bound to this exact request

Commit
  14. nonce checked and consumed atomically (no await between check and write)

Network (last, closest to the side effect)
  15. RevocationRegistry.anyRevoked(issuers, ids) — denied on RPC failure or stale state
  16. execute the transfer, return a receipt
```

Notes:

- **Step 3** is what prevents an attacker rooting a chain against someone else's treasury. Proof of personhood adds assurance on top but never replaces it.
- **Step 13** never widens scope. A request outside scope is rejected regardless of human approval; granting more authority means issuing a new delegation.
- **Steps 14–16** are ordered so the revocation read sits immediately before the side effect. A residual race between that read and the transfer remains; fully atomic enforcement would require checking authorization inside the executing transaction.

## 7. Revocation registry

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Records revocations in the revoker's own namespace. It does not prove a
/// delegation exists — existence and validity come from the signed token.
/// Cascade is a property of chain verification: every (issuer, id) pair in a
/// presented chain must be unrevoked, so revoking an ancestor rejects all
/// descendants with no enumeration.
contract RevocationRegistry {
    mapping(address => mapping(bytes32 => bool)) public revoked;

    event Revoked(address indexed issuer, bytes32 indexed id, uint64 at);
    error LengthMismatch();
    error AlreadyRevoked();

    function revoke(bytes32 id) external {
        if (revoked[msg.sender][id]) revert AlreadyRevoked();
        revoked[msg.sender][id] = true;
        emit Revoked(msg.sender, id, uint64(block.timestamp));
    }

    function anyRevoked(address[] calldata issuers, bytes32[] calldata ids)
        external view returns (bool)
    {
        if (issuers.length != ids.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            if (revoked[issuers[i]][ids[i]]) return true;
        }
        return false;
    }

    function statusOf(address[] calldata issuers, bytes32[] calldata ids)
        external view returns (bool[] memory out)
    {
        if (issuers.length != ids.length) revert LengthMismatch();
        out = new bool[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = revoked[issuers[i]][ids[i]];
    }
}
```

- An issuer can only revoke in **its own namespace** — nobody can squat or block someone else's delegation.
- Revocation is **one write, O(1)**. Verification is **O(chain depth)**. There is **no descendant enumeration**: revoking an ancestor invalidates every chain that passes through it.
- The contract is deliberately minimal. It stores only what must be shared across organisations.

### Why a blockchain at all

Signatures handle delegation without one. Ethereum provides **shared revocation state across organisations** that don't want a single vendor operating the authority database. Databases and PKI can do authorization too — they need a trusted operator. Mandate removes that operator for the part that matters most across organisational boundaries: revocation.

## 8. Discovery and authority records

### ENS — agents as names

Each agent is an ENS name on Sepolia (ENSv2). Its text records point to its delegation:

```
mandate:delegation-id    0x…
mandate:delegation-uri   location of the full signed delegation
mandate:parent-id        0x…
mandate:subject          0x…
mandate:registry         0x…
```

Given only a name, the CLI resolves the records, follows `parent-id` to the root, fetches each full delegation, and verifies the chain:

```bash
pnpm verify settle.procure.ops.treasury.dhruv.eth
```

An ENS name is an entry point, not proof of validity. Everything fetched stays untrusted until its hash and signature verify.

### Arkiv — a queryable record of authority

Each delegation is stored on Arkiv as an entity **owned by the issuer's wallet**, with the full signed payload and filterable attributes (`id`, `parentId`, `rootId`, `issuer`, `subject`, `actions`, `maxAmount`, `expiry`, `targets`, `depth`).

The **Authority Explorer** answers "what authority exists under this root right now?":

1. Query Arkiv for every delegation under a root.
2. Verify signatures and chain structure locally.
3. Check current revocation status on Ethereum.
4. Show only genuinely usable authority as active.

A counterparty can look up delegations it never received, issued by someone it doesn't trust, without asking our server. Arkiv's native expiry is a convenience; expiry is always re-checked cryptographically.

### World ID — the human at the root

- **Root issuance:** the root delegation is accompanied by a World ID proof, verified server-side, bound to the issuer address. One human, one root.
- **Fresh approval above a threshold:** requests that are within scope but above $15 require a fresh World ID approval bound to that exact request. Cancelling the approval means nothing executes.

We need **uniqueness, not identity**. Proof of Human answers exactly that; we deliberately avoid document-based credentials because collecting name or nationality would be more invasive without being more secure.

## 9. Demo walkthrough

### The chain

| Grant | Actions | Per-execution ceiling | Targets | Expiry |
|---|---|---|---|---|
| Owner → Operations | `invoice.read`, `payment.transfer` | $500 | any | +24h |
| Operations → Procurement | `invoice.read`, `payment.transfer` | $100 | supplierA, supplierB | +2h |
| Procurement → Settlement | `payment.transfer` | $25 | supplierA | +1h |

### Scenario 1 — valid execution

Settlement requests `payment.transfer`, $10, supplierA. The service verifies the request signature and the full chain, consumes the nonce, sends Sepolia USDC, and returns a receipt with the transaction hash.

### Scenario 2 — a prompt-injected agent

The procurement agent is an LLM with one tool: sign a delegation. It reads a supplier invoice containing a hidden instruction. It signs a delegation to Settlement with:

- `actions: [payment.transfer, account.manage]`
- `maxAmount: $1,000`
- `targets: ["*"]`

The signature is genuine. The service rejects the chain with three named violations — **actions, maxAmount, targets** — on the Procurement → Settlement edge, and **the balance does not change**.

### Scenario 3 — ancestor revocation

The owner revokes Owner → Operations: one transaction, one `bytes32`. The previously valid settlement request, resent with a fresh nonce, is now refused — on revocation, not replay. No downstream delegation had to be touched.

### Scenario 4 — discovery

From the ENS name alone, the CLI reconstructs and verifies the three-hop chain. The Authority Explorer lists only verified, unrevoked authority from Arkiv.

## 10. Security tests

**Chain:** wrong root · wrong chainId · wrong registry · mutated payload · bad signature · broken parent link · issuer ≠ parent's subject · expired ancestor · revoked root · revoked intermediate · registry read failure · stale registry state — all rejected.

**Execution:** wrong final-agent key · recipient changed after signing · amount changed after signing · wrong audience · replayed nonce — all rejected. Concurrent requests with the same nonce: exactly one succeeds. Human approval does not validate an out-of-scope request.

**Most important:** a failed authorization produces **no side effect**. The test asserts the balance is unchanged.

## 11. Prior art and where Mandate fits

Mandate is applied capability security. We are not claiming to invent attenuation.

| Prior art | What it does | Where Mandate differs |
|---|---|---|
| Macaroons (Google, 2014) | Bearer tokens with caveat attenuation | No cross-organisation revocation or discovery |
| UCAN, Biscuit | Capability tokens with attenuation and chaining | Revocation is implementation-defined, typically per operator |
| MetaMask Delegation Toolkit (ERC-7710/7715) | Redelegation chains where caveats can only add restrictions, enforced onchain | Enforces onchain execution from a smart account; Mandate targets off-chain resources (HTTP APIs, services) and adds discovery and a queryable authority graph |
| ERC-8004 | Agent identity and reputation | Identity, not authorization scope |
| OAuth 2.0 / RFC 8693 | Delegated, downscoped access via an authorization server | Requires a central operator both sides trust |
| Earlier ETHGlobal agent-permission projects (e.g. Steg, ENSign) | Human-set agent permissions published on ENS or enforced in smart accounts | Mandate lets **agents sub-delegate to other agents, N hops deep**, each hop provably narrower, verified at any HTTP endpoint, with cross-organisation revocation |

> Capability attenuation is solved for onchain execution. It isn't solved for what agents mostly do: call an API, book a service, hit a merchant endpoint. Mandate is attenuated delegation for **off-chain resource boundaries**.

## 12. Limitations and non-goals

- No aggregate or shared spending budgets; `maxAmount` is per-execution.
- No legal identity or liability determination.
- No protection against a compromised root key.
- No prevention of harmful actions already inside granted scope. Authorization bounds the action space; it doesn't prove an action is wise.
- No undoing completed transactions.
- No protection for services that bypass enforcement.
- Revocation is as fresh as the last registry read; no instantaneous revocation under network partition.
- Replay protection is in-memory and restart-unsafe in this prototype.
- The payment adapter is backend-controlled; this is not decentralized payment enforcement.
- The LLM agent demonstrates a realistic threat; it is not part of the security property.

## 13. Repository layout

```
mandate/
├── README.md · SPEC.md · LICENSE
├── AI/                    AI usage log and prompt artifacts
├── arkiv/                 schema and Arkiv integration notes
├── docs/                  architecture, demo script, World feedback
├── fixtures/              sample invoices (normal + malicious)
├── packages/
│   ├── core/              types, narrow, canonical, sign, verify, config + tests
│   ├── contracts/         RevocationRegistry.sol, Foundry tests, deploy script
│   ├── payment-service/   POST /execute — the enforcement boundary
│   ├── agents/            operations, procurement (LLM), settlement, rogue
│   ├── cli/               verify <ens-name>
│   └── dashboard/         chain view, Authority Explorer, attack controls
└── scripts/               seed/reset, attack scenarios
```

**Stack:** TypeScript · viem · Foundry · Sepolia · ENS · `@arkiv-network/sdk` · World IDKit · Next.js · Express · vitest + fast-check + forge.

## 14. Deployments

| Item | Network | Address / name |
|---|---|---|
| RevocationRegistry | Sepolia (11155111) | _TBD_ |
| Root ENS name | Sepolia | `treasury.dhruv.eth` |
| Arkiv writer wallet | Arkiv testnet | _TBD_ |

---

*Agents can subcontract the task. They cannot expand the authority.*