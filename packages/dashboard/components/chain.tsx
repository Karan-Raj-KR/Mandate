"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { DenyCode, NarrowFailure, Verdict as VerdictT } from "@mandate/core";
import { Ticket } from "@/components/ticket";
import { ETHERSCAN, type Run } from "@/lib/api";
import { Badge, Hash, short, time, usdc } from "./ui";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
const ROLE: Record<string, string> = { treasury: "Owner · human", ops: "Operations agent", procure: "Procurement agent · LLM", settle: "Settlement agent" };
const role = (ens: string) => ROLE[ens.split(".")[0]] ?? "Agent";

export function StageColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-4">
      <h2 className="m-serif text-4xl">{title}</h2>
      {children}
    </section>
  );
}

/** Plain text only: React escapes it, never dangerouslySetInnerHTML. */
export function PlainText({ label, text }: { label: string; text: string }) {
  return (
    <section className="bg-black">
      <h3 className={`px-4 pt-3 text-sm font-medium ${label === "Rogue-agent fixture" ? "text-bad" : label === "Model output" ? "text-fg" : "text-muted"}`}>{label}</h3>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 pt-2 font-mono text-xs leading-relaxed">{text}</pre>
    </section>
  );
}

/** Lines that are part of a hidden instruction (HTML comment or script) get a red underline. Still plain text. */
function injectedLines(text: string) {
  let inComment = false;
  return text.split("\n").map((line) => {
    const opens = line.includes("<!--");
    const flagged = inComment || opens || /<script/i.test(line);
    if (opens) inComment = true;
    if (line.includes("-->")) inComment = false;
    return { line, flagged };
  });
}

export function InvoiceSheet({ text }: { text: string }) {
  const lines = injectedLines(text);
  const poisoned = lines.some((l) => l.flagged);
  return (
    <div className="paper paper-torn enter px-5 pb-9 pt-5">
      <p className="mb-3 flex items-baseline justify-between gap-3">
        <span className="m-serif text-2xl">Supplier invoice</span>
        {poisoned && <span className="text-sm font-semibold text-bad">Injected</span>}
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {lines.map(({ line, flagged }, i) => (
          <span key={i} className="block">
            {flagged && !lines[i - 1]?.flagged && <span className="mb-1 mt-3 block font-sans text-sm font-semibold text-bad">↓ Injected instruction</span>}
            <span className={flagged ? "injected text-bad" : ""}>{line || " "}</span>
          </span>
        ))}
      </pre>
    </div>
  );
}

/** Types the model output out; instant when reduced motion is on. */
export function Typewriter({ label, text }: { label: string; text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(text.length);
    setN(0);
    const t = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + 4)), 16);
    return () => clearInterval(t);
  }, [text]);
  return <PlainText label={label} text={text.slice(0, n) + (n < text.length ? "▍" : "")} />;
}

/** One term of a permit, in the sentence on the ticket. A term that grew is underlined. */
function Term({ bad, children }: { bad?: boolean; children: ReactNode }) {
  return <span className={bad ? "font-semibold text-fg underline decoration-2 underline-offset-4" : "text-fg"}>{children}</span>;
}

// Width is authority. Each hop is narrower than its parent; a hop that grew is drawn past all of them.
const OWNER_WIDTH = 92;
const WIDTHS = [84, 70, 56];
const GREW_WIDTH = 100;

/** Owner → agents as a staircase of tickets, narrowing at every hop. */
export function PermitChain({ run, showRevoked }: { run: Run; showRevoked: boolean }) {
  const edges = run.verdict.ok ? [] : run.verdict.edges ?? [];
  const root = run.chain[0];
  const firstRevoked = showRevoked ? run.revoked.indexOf(true) : -1;
  return (
    <div className="space-y-[3px]">
      <div data-ui className="paper flex min-w-64 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3" style={{ width: `${OWNER_WIDTH}%` }}>
        <div className="min-w-0">
          <p className="font-medium leading-tight">{role(root.issuerName)}</p>
          <p className="truncate font-mono text-xs text-muted">{root.issuerName}</p>
        </div>
        <Badge tone={run.mock ? "warn" : "ok"}>World-verified{run.mock ? " · mock" : ""}</Badge>
      </div>

      {run.chain.map((d, i) => {
        const failures = edges.find((e) => e.edge === i)?.failures ?? [];
        const bad = new Set(failures.map((f) => f.dimension));
        const dead = firstRevoked >= 0 && i >= firstRevoked;
        const tone = dead ? "dead" : failures.length ? "grew" : "live";
        const width = failures.length ? GREW_WIDTH : WIDTHS[i] ?? WIDTHS[WIDTHS.length - 1];
        const from = i === 0 ? OWNER_WIDTH : WIDTHS[i - 1] ?? OWNER_WIDTH;
        const targets = d.scope.targets.join(", ");
        return (
          <div key={d.id} className="relative">
            <Ticket
              who={role(d.subjectName)} sub={d.subjectName} amount={usdc(d.scope.maxAmount)} tone={tone}
              className="narrow m-lift min-w-64 max-w-full"
              style={{ width: `${width}%`, "--from": `${from}%`, "--limit": `${from}%`, ...delay(i * 650) } as CSSProperties}
            >
              <p className="text-muted">
                May <Term bad={bad.has("actions")}>{d.scope.actions.join(", ")}</Term>, paying <Term bad={bad.has("targets")}>{targets === "*" ? "anyone (*)" : targets}</Term>, until <Term bad={bad.has("expiry")}>{time(d.scope.expiry)}</Term>.
              </p>
              <p className="mt-1 font-mono text-xs text-muted">permit {short(d.id)}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <Badge tone={run.mock ? "warn" : "ok"}>{run.mock ? "Signature · mock, not verified" : "Signature verified"}</Badge>
                {firstRevoked === i ? <Badge tone="bad">Revoked</Badge>
                  : dead ? <Badge tone="bad">Void · parent revoked</Badge>
                  : <Badge tone={run.mock ? "warn" : "ok"}>{run.mock ? "Not revoked · mock read" : "Not revoked"}</Badge>}
              </div>
              {failures.length > 0 && <Violations edge={i} parent={run.chain[i - 1].subjectName} child={d.subjectName} failures={failures} />}
            </Ticket>
          </div>
        );
      })}
    </div>
  );
}

function Violations({ edge, parent, child, failures }: { edge: number; parent: string; child: string; failures: NarrowFailure[] }) {
  return (
    <div className="relative z-10 mt-4 bg-[#7a0d08] p-3">
      <p className="font-semibold">This agent tried to give more power than it had ({failures.length} {failures.length === 1 ? "way" : "ways"})</p>
      <ul className="mt-2 space-y-2">
        {failures.map((f) => (
          <li key={f.dimension}>
            <b>{f.dimension}</b>: {f.reason}
            <span className="block break-words font-mono text-xs opacity-85">edge {edge} · {short(parent)} → {short(child)} · parent {f.parentValue} → child {f.childValue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The signed request: a cheque written by the last agent in the chain. */
export function RequestCard({ run }: { run: Run }) {
  const r = run.request;
  const signer = run.chain[run.chain.length - 1].subjectName;
  return (
    <div className="enter bg-black p-5">
      <p className="text-2xl font-medium tracking-tight">Pay <span className="tabular-nums">{usdc(r.amount)}</span> to <span className="font-mono text-xl">{r.target}</span></p>
      <p className="mt-2 text-sm text-muted">
        {r.action} for {r.audience}, valid until {time(Number(r.deadline))}. One-time code <Hash value={r.nonce} />
      </p>
      <p className="mt-4 border-t border-line pt-2 text-right"><span className="m-serif text-2xl">{short(signer)}</span><span className="block text-xs text-muted">Signed request</span></p>
    </div>
  );
}

// ---------- the breaker: plain-English checks, technical detail underneath ----------

/** SPEC §6 step each deny code comes from. Checks after the first failure are "not reached". */
const STEP: Record<DenyCode, number> = {
  SCHEMA: 1, EMPTY_CHAIN: 2, TOO_DEEP: 2, NOT_ROOT: 2, WRONG_ROOT: 3, ID_MISMATCH: 4, BAD_SIGNATURE: 5, PARENT_LINK: 6,
  ISSUER_LINK: 7, AMPLIFICATION: 8, EXPIRED: 9, DEADLINE: 9, AUDIENCE: 10, REQUEST_SIGNATURE: 11, OUT_OF_SCOPE: 12,
  STEP_UP_REQUIRED: 13, REPLAY: 14, REVOKED: 15, REGISTRY_UNAVAILABLE: 15, STALE_STATE: 15, EXECUTION_FAILED: 16,
};
const CHECKS = [
  { title: "Traces back to the owner", rule: "steps 2–4, 6–7 · pinned root, ids, parent & issuer links", steps: [1, 2, 3, 4, 6, 7], mockSkips: true },
  { title: "No permit grew its powers", rule: "step 8 · narrows() on every edge", steps: [8] },
  { title: "Signed by the right agent", rule: "steps 5, 11 · EIP-712 issuer + request signatures", steps: [5, 11], mockSkips: true },
  { title: "Not revoked", rule: "step 15 · RevocationRegistry.anyRevoked", steps: [15] },
  { title: "Fresh, not a replay", rule: "steps 9, 10, 14 · expiry, deadline, audience, one-time nonce", steps: [9, 10, 14] },
  { title: "Within the amount allowed", rule: "steps 12–13 · final scope + World ID above $15", steps: [12, 13, 16] },
];
type CheckStatus = "pass" | "fail" | "not reached" | "skipped (mock)";

export function checkStatuses(v: VerdictT, mock: boolean): CheckStatus[] {
  const failStep = v.ok ? Infinity : STEP[v.code];
  return CHECKS.map((c) => {
    if (!v.ok && c.steps.includes(failStep)) return "fail";
    if (mock && c.mockSkips) return "skipped (mock)";
    // step 16 is the transfer itself: it only matters if it is the step that failed
    return c.steps.filter((s) => s < 16).every((s) => s < failStep) ? "pass" : "not reached";
  });
}

const WORD: Record<CheckStatus, string> = { pass: "text-ok", fail: "text-bad", "not reached": "text-muted", "skipped (mock)": "text-warn" };
const SWITCH: Record<CheckStatus, string> = { pass: "on", fail: "tripped", "not reached": "idle", "skipped (mock)": "skipped" };

/** A breaker board: one switch per check. The board's main switch is the verdict. */
export function Gatekeeper({ run }: { run: Run }) {
  const v = run.verdict;
  const st = checkStatuses(v, run.mock);
  return (
    <div className="bg-[#120d0c]">
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="font-medium">Main breaker</p>
          <p className="font-mono text-xs text-muted">POST /execute{run.mock ? " · simulated" : ""}</p>
        </div>
        <p className={`m-display text-3xl ${v.ok ? "text-ok" : "text-bad"}`}>{v.ok ? "closed" : "tripped"}</p>
      </div>
      <ol className="space-y-[2px]">
        {CHECKS.map((c, i) => (
          <li key={c.title} className="enter grid grid-cols-[2.5rem_1fr] gap-x-3 bg-[#1a1412] p-4" style={delay(i * 700)}>
            <span aria-hidden className="switch mt-0.5" data-s={SWITCH[st[i]]} style={delay(i * 700 + 250)} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium">{c.title} <span className={`text-xs font-normal ${WORD[st[i]]}`}>{st[i]}</span></p>
              <p className="mt-0.5 font-mono text-xs text-muted">{c.rule}</p>
              {st[i] === "fail" && !v.ok && (
                <div className="mt-2 break-words font-mono text-xs leading-relaxed text-bad">
                  <p>{v.code}: {v.detail}</p>
                  {v.edges?.map((e) => e.failures.map((f) => (
                    <p key={`${e.edge}${f.dimension}`}>edge {e.edge} · <b>{f.dimension}</b>: {f.reason} ({f.parentValue} → {f.childValue})</p>
                  )))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "ASKED vs ALLOWED": the allowed amount fills the box, the excess spills past it in red. */
export function moneyShot(run: Run): { asked: bigint; allowed: bigint } | null {
  const v = run.verdict;
  if (v.ok) return null;
  const grew = v.edges?.flatMap((e) => e.failures).find((f) => f.dimension === "maxAmount");
  const allowed = grew ? BigInt(grew.parentValue) : v.code === "OUT_OF_SCOPE" ? run.chain[run.chain.length - 1].scope.maxAmount : null;
  return allowed !== null && run.request.amount > allowed ? { asked: run.request.amount, allowed } : null;
}

export function MoneyShot({ asked, allowed }: { asked: bigint; allowed: bigint }) {
  const boxPct = Number((allowed * 10000n) / asked) / 100;
  return (
    <div className="space-y-2 font-mono text-sm">
      <p className="flex justify-between gap-4 text-bad"><span>Asked</span><span className="tabular-nums">{usdc(asked)}</span></p>
      <p className="flex justify-between gap-4"><span>Allowed</span><span className="tabular-nums">{usdc(allowed)}</span></p>
      <div className="relative h-5" role="img" aria-label={`${usdc(allowed)} allowed, ${usdc(asked - allowed)} over the limit`}>
        <div className="absolute inset-y-0 left-0 z-10 bg-fg" style={{ width: `${boxPct}%` }} />
        <div className="spill absolute inset-y-0 right-0 bg-bad" style={{ left: `${boxPct}%` }} />
      </div>
      <p className="flex justify-between gap-4 border-t border-dashed border-line pt-2 font-semibold text-bad"><span>Over the limit</span><span className="tabular-nums">+{usdc(asked - allowed)}</span></p>
    </div>
  );
}

/** The result, as a receipt the breaker stamps: EXECUTED, or TRIPPED with every reason and "No money moved". */
export function Verdict({ run }: { run: Run }) {
  const v = run.verdict;
  const r = run.request;
  const shot = moneyShot(run);
  return (
    <div className="paper paper-torn enter relative space-y-4 overflow-hidden px-5 pb-10 pt-5">
      <p className="m-serif text-2xl">Payment service receipt</p>
      <span role="status" className={`stamp-ink absolute right-4 top-12 text-3xl ${v.ok ? "text-ok" : "text-bad"}`}>{v.ok ? "EXECUTED" : "TRIPPED"}</span>
      {v.ok ? (
        <>
          <p className="pt-12 text-2xl font-medium tracking-tight">Paid {usdc(r.amount)} to {r.target}.</p>
          {run.txHash && (run.simulated
            ? <p className="text-sm">Receipt <span className="font-mono">{short(run.txHash)}</span> <Badge tone="warn">Simulated payment · no on-chain transfer</Badge></p>
            : run.mock
            ? <p className="text-sm">Receipt <span className="font-mono">{short(run.txHash)}</span> <Badge tone="warn">Mock tx · no Etherscan link</Badge></p>
            : <p className="text-sm">Receipt <Hash value={run.txHash} /> · <a className="underline underline-offset-4" href={`${ETHERSCAN}/tx/${run.txHash}`} target="_blank" rel="noreferrer">View on Sepolia Etherscan</a></p>)}
        </>
      ) : (
        <>
          <p className="pt-12 text-2xl font-medium tracking-tight">DENIED. No money moved.</p>
          <p className="text-sm text-muted">Balance unchanged. No money moved.</p>
          {v.code === "REVOKED" && <p className="text-xl font-medium text-bad">REVOKED UPSTREAM <span className="block text-sm font-normal text-muted">The owner cancelled a permit above this agent, so its authority is gone.</span></p>}
          {shot && <MoneyShot asked={shot.asked} allowed={shot.allowed} />}
          <p className="break-words font-mono text-xs text-bad">{v.code}: {v.detail}</p>
        </>
      )}
      {run.stepUp.required && (
        <p className="border-t border-dashed border-line pt-3 text-sm">
          World ID approval required above $15:{" "}
          {run.stepUp.approved === "demo-bypass" ? <Badge tone="warn">Demo bypass, not World ID</Badge> : run.stepUp.approvedNonce === r.nonce ? <Badge tone="ok">Approved for this exact request</Badge> : <Badge tone="bad">Not approved for this request</Badge>}
        </p>
      )}
    </div>
  );
}

/** The request ledger, newest first. */
export function Timeline({ runs, selected, onSelect }: { runs: Run[]; selected?: string; onSelect: (r: Run) => void }) {
  if (!runs.length) return null;
  return (
    <ol className="max-h-72 space-y-[2px] overflow-y-auto text-sm">
      {runs.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onSelect(r)} className={`grid w-full grid-cols-[5rem_1fr] items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 text-left transition-colors duration-300 sm:grid-cols-[5rem_14rem_1fr] ${r.id === selected ? "bg-[#241b19]" : "bg-[#171211] hover:bg-[#1f1715]"}`}>
            <span className="font-mono text-xs text-muted">{new Date(r.at * 1000).toLocaleTimeString("en-GB")}</span>
            <Badge tone={r.verdict.ok ? "ok" : "bad"}>{r.verdict.ok ? "Executed" : `Denied · ${r.verdict.code}`}</Badge>
            <span className="col-span-2 truncate font-mono text-xs sm:col-span-1">{usdc(r.request.amount)} → {r.request.target}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
