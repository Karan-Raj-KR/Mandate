// The ONLY data-access file. Live when NEXT_PUBLIC_SERVICE_URL is set, otherwise fixtures (MOCK DATA badge).
import { checkAllEdges, ZERO_ID, type Delegation, type EdgeFailure, type ExecutionRequest, type Verdict } from "@mandate/core";
import type { Hex } from "viem";
import * as fx from "../fixtures/demo";

export const SERVICE_URL = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";
export const MOCK = !SERVICE_URL;
/** loadVerifierConfig's default STEP_UP_THRESHOLD ($15, 6dp). Display only; the service decides. */
export const STEP_UP = 15_000_000n;
export const ETHERSCAN = "https://sepolia.etherscan.io";

export type Scenario = "legit" | "amplify" | "replay" | "revoke" | "stepup";
export type Run = {
  id: string;
  at: number;
  scenario: Scenario;
  mock: boolean;
  attempted: string;
  invoice: string;
  agentOutput: { label: "Model output" | "Rogue-agent fixture" | "Scripted fixture"; text: string };
  chain: Delegation[];
  revoked: boolean[]; // per hop, from the registry read
  request: ExecutionRequest;
  verdict: Verdict;
  txHash?: Hex;
  stepUp: { required: boolean; approvedNonce?: Hex };
};

// ---------- mock service (fixtures). Amplification uses core's real checkAllEdges; signatures are NOT verified. ----------

const rand32 = () => ("0x" + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;

export const mock = { revoked: new Set<Hex>(), usedNonces: new Set<Hex>(), lastExecuted: undefined as ExecutionRequest | undefined };

/** Owner revokes Owner → Operations (fixture ids don't depend on time). */
export function mockRevokeRoot() {
  mock.revoked.add(fx.demoChain(0)[0].id);
}

export function mockRun(scenario: Scenario, now: number, worldApproved = false): Run {
  const rogue = scenario === "amplify";
  const chain = fx.demoChain(now, rogue);
  const replay = scenario === "replay" && mock.lastExecuted;
  const amount = rogue ? 450 : scenario === "stepup" ? 20 : 10;
  const request: ExecutionRequest = replay
    ? mock.lastExecuted!
    : {
        leafId: chain[chain.length - 1].id, audience: "payment-service", action: "payment.transfer",
        amount: BigInt(amount) * 1_000_000n, target: rogue ? "attackerWallet" : "supplierA",
        nonce: rand32(), deadline: BigInt(now + 120), sig: ("0x" + "5".repeat(130)) as Hex,
      };
  // a World approval binds to this exact request's nonce; a replay carries the original approval along
  const stepUp = { required: request.amount > STEP_UP, approvedNonce: worldApproved || replay ? request.nonce : undefined };

  // Same order as SPEC §6: 8 amplification → 12 scope → 13 step-up → 14 nonce → 15 revocation
  let verdict: Verdict;
  const edges = checkAllEdges(chain);
  const leaf = chain[chain.length - 1].scope;
  if (edges.length) verdict = { ok: false, code: "AMPLIFICATION", detail: amplificationDetail(edges), edges };
  else if (request.amount > leaf.maxAmount) verdict = { ok: false, code: "OUT_OF_SCOPE", detail: `amount ${request.amount} exceeds ceiling ${leaf.maxAmount}` };
  else if (stepUp.required && stepUp.approvedNonce !== request.nonce)
    verdict = { ok: false, code: "STEP_UP_REQUIRED", detail: "request above $15 needs a World ID approval bound to this exact request" };
  else if (mock.usedNonces.has(request.nonce)) verdict = { ok: false, code: "REPLAY", detail: `nonce ${request.nonce} was already used` };
  else {
    mock.usedNonces.add(request.nonce);
    verdict = chain.some((d) => mock.revoked.has(d.id))
      ? { ok: false, code: "REVOKED", detail: "a delegation in the chain has been revoked" }
      : { ok: true };
  }
  if (verdict.ok) mock.lastExecuted = request;

  return {
    id: rand32(), at: now, scenario, mock: true,
    attempted: ATTEMPTED[scenario],
    invoice: rogue ? fx.MALICIOUS_INVOICE : fx.NORMAL_INVOICE,
    agentOutput: rogue ? { label: "Rogue-agent fixture", text: fx.ROGUE_OUTPUT } : { label: "Scripted fixture", text: fx.LEGIT_MODEL_OUTPUT },
    chain, revoked: chain.map((d) => mock.revoked.has(d.id)), request, verdict, stepUp,
    txHash: verdict.ok ? rand32() : undefined,
  };
}

const ATTEMPTED: Record<Scenario, string> = {
  legit: "Settlement pays 10 USDC to supplierA under a valid 3-hop chain",
  amplify: "Prompt-injected procurement agent grants settlement 1000 USDC, account.manage, any target; settlement requests 450 USDC",
  replay: "The last executed request is sent again with the same nonce",
  revoke: "Owner revoked Owner → Operations; settlement re-sends a valid request with a fresh nonce",
  stepup: "Settlement pays 20 USDC (above the $15 World ID threshold)",
};

export function amplificationDetail(edges: EdgeFailure[]) {
  return `scope expands its parent (${edges.map((e) => `edge ${e.edge}: ${e.failures.map((f) => f.dimension).join(", ")}`).join("; ")})`;
}

// ---------- live service ----------

/** Asked of the payment-service owner: GET /requests → Run[] with bigints as decimal strings. */
export async function fetchTimeline(): Promise<Run[]> {
  const r = await fetch(`${SERVICE_URL}/requests`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /requests → HTTP ${r.status}`);
  return ((await r.json()) as Run[]).map(reviveRun);
}

function reviveRun(r: Run): Run {
  return {
    ...r,
    mock: false,
    chain: r.chain.map((d) => ({ ...d, scope: { ...d.scope, maxAmount: BigInt(d.scope.maxAmount) } })),
    request: { ...r.request, amount: BigInt(r.request.amount), deadline: BigInt(r.request.deadline) },
  };
}

// ---------- Authority Explorer ----------

export type AuthorityRow = { d: Delegation; depth: number; status: "USABLE" | "DENIED"; reasons: string[] };

/** Arkiv query → local structure checks → revocation. Anything unreadable is DENIED, never "unknown". */
export async function exploreAuthority(root: string, now: number): Promise<AuthorityRow[]> {
  if (!MOCK) {
    // Not wired yet: needs the Arkiv SDK + schema, and verify/registry exports from @mandate/core.
    throw new Error("live Arkiv query and revocation read are not wired yet");
  }
  const legit = fx.demoChain(now);
  const all = [...legit, fx.demoChain(now, true)[2]];
  const rootD = all.find((d) => d.parent === ZERO_ID && (d.id === root || d.issuerName === root));
  if (!rootD) throw new Error(`no delegations found under "${root}"`);

  const rows: AuthorityRow[] = [];
  const walk = (path: Delegation[]) => {
    const d = path[path.length - 1];
    const reasons: string[] = ["signature: mock fixture, not verified"];
    for (const e of checkAllEdges(path)) {
      for (const f of e.failures) reasons.push(`edge ${e.edge} ${f.dimension}: ${f.reason} (${f.parentValue} → ${f.childValue})`);
    }
    for (const a of path) {
      if (mock.revoked.has(a.id)) reasons.push(`revoked: ${a.subjectName === d.subjectName ? "this delegation" : `ancestor ${a.subjectName}`}`);
      if (a.scope.expiry <= now) reasons.push(`expired: ${a.subjectName}`);
    }
    // the mock signature note alone does not deny in fixture mode; anything else does
    rows.push({ d, depth: path.length - 1, status: reasons.length === 1 ? "USABLE" : "DENIED", reasons });
    for (const c of all.filter((x) => x.parent === d.id)) walk([...path, c]);
  };
  walk([rootD]);
  return rows;
}
