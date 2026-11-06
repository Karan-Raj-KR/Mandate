"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { DenyCode, NarrowFailure, Verdict as VerdictT } from "@mandate/core";
import { SpotlightCard } from "@/components/kit/spotlight-card";
import { ETHERSCAN, type Run } from "@/lib/api";
import { Badge, Hash, short, time, usdc } from "./ui";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
const ROLE: Record<string, string> = { treasury: "Owner · human", ops: "Operations agent", procure: "Procurement agent · LLM", settle: "Settlement agent" };
const role = (ens: string) => ROLE[ens.split(".")[0]] ?? "Agent";

export function StageColumn({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold">
        <span className="font-mono text-xs text-lime">0{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

/** Plain text only: React escapes it, never dangerouslySetInnerHTML. */
export function PlainText({ label, text }: { label: string; text: string }) {
  return (
    <section className="panel">
      <h3 className="border-b border-line px-3 py-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted">{label}</h3>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{text}</pre>
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
    <div className="panel enter p-4">
      <p className="mb-2 flex justify-between font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        <span>Supplier invoice</span>
        {poisoned && <span className="rounded-full border border-bad px-2 text-bad">injected</span>}
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {lines.map(({ line, flagged }, i) => (
          <span key={i} className="block">
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

function Field({ k, bad, children }: { k: string; bad?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[0.7rem] text-muted">{k}</span>
      <span className={`text-right font-mono text-xs ${bad ? "font-semibold text-bad" : ""}`}>{children}</span>
    </div>
  );
}

/** One vertical wire segment. Authority is current: thinner = less authority. */
function Wire({ px, state }: { px: number; state: "live" | "grew" | "dead" }) {
  const color = { live: "bg-lime", grew: "bg-bad", dead: "bg-line" }[state];
  return <span aria-hidden className={`absolute left-1/2 top-0 bottom-0 -translate-x-1/2 rounded-full ${color}`} style={{ width: px }} />;
}

function Node({ label, state }: { label: string; state: "live" | "grew" | "dead" }) {
  const c = { live: "border-lime text-lime", grew: "border-bad text-bad", dead: "border-line text-muted" }[state];
  return <span className={`relative z-10 grid size-10 place-items-center rounded-full border-2 bg-bg font-display text-xs font-bold ${c}`}>{label}</span>;
}

/** Owner → agents as nodes on a wire; each hop's wire thinner than the one above. */
export function PermitChain({ run, showRevoked }: { run: Run; showRevoked: boolean }) {
  const edges = run.verdict.ok ? [] : run.verdict.edges ?? [];
  const root = run.chain[0];
  const firstRevoked = showRevoked ? run.revoked.indexOf(true) : -1;
  let px = 10;
  return (
    <div className="space-y-0">
      <div className="grid grid-cols-[3rem_1fr] items-center gap-4 pb-4">
        <div className="relative flex justify-center self-stretch"><Node label={root.issuerName.slice(0, 2).toUpperCase()} state={firstRevoked === 0 ? "dead" : "live"} /></div>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="font-display text-base font-semibold">{role(root.issuerName)}</p>
            <p className="font-mono text-xs text-muted">{root.issuerName}</p>
          </div>
          <Badge tone={run.mock ? "warn" : "ok"}>World-verified{run.mock ? " · mock" : ""}</Badge>
        </div>
      </div>

      {run.chain.map((d, i) => {
        const failures = edges.find((e) => e.edge === i)?.failures ?? [];
        const bad = new Set(failures.map((f) => f.dimension));
        px = failures.length ? px + 4 : i === 0 ? px : Math.max(2, px - 3);
        const dead = firstRevoked >= 0 && i >= firstRevoked;
        const state = dead ? "dead" : failures.length ? "grew" : "live";
        return (
          <div key={d.id} className="enter grid grid-cols-[3rem_1fr] gap-4" style={delay(i * 260)}>
            <div className="relative flex flex-col items-center">
              <Wire px={px} state={state} />
              <span className="h-6" />
              <Node label={d.subjectName.slice(0, 2).toUpperCase()} state={state} />
            </div>
            <SpotlightCard tone={state === "grew" ? "bad" : state === "dead" ? "off" : "lime"} className={`mb-4 p-4 text-xs ${state === "grew" ? "border-bad" : "border-line"} ${dead ? "opacity-60" : ""}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold">{role(d.subjectName)}</p>
                  <p className="truncate font-mono text-[0.7rem] text-muted" title={d.subjectName}>{d.subjectName}</p>
                </div>
                <span className="font-mono text-[0.65rem] text-muted">permit {short(d.id)} · wire {px}px</span>
              </div>
              <Field k="Actions" bad={bad.has("actions")}>{d.scope.actions.join(", ")}</Field>
              <Field k="Max per request" bad={bad.has("maxAmount")}>{usdc(d.scope.maxAmount)}</Field>
              <Field k="Expires" bad={bad.has("expiry")}>{time(d.scope.expiry)}</Field>
              <Field k="Pay to" bad={bad.has("targets")}>{d.scope.targets.join(", ") === "*" ? "anyone (*)" : d.scope.targets.join(", ")}</Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={run.mock ? "warn" : "ok"}>{run.mock ? "Signature · mock, not verified" : "Signature verified"}</Badge>
                {firstRevoked === i ? <Badge tone="bad">Revoked</Badge>
                  : dead ? <Badge tone="bad">Void · parent revoked</Badge>
                  : <Badge tone={run.mock ? "warn" : "ok"}>{run.mock ? "Not revoked · mock read" : "Not revoked"}</Badge>}
              </div>
              {failures.length > 0 && <Violations edge={i} parent={run.chain[i - 1].subjectName} child={d.subjectName} failures={failures} />}
            </SpotlightCard>
          </div>
        );
      })}
    </div>
  );
}

function Violations({ edge, parent, child, failures }: { edge: number; parent: string; child: string; failures: NarrowFailure[] }) {
  return (
    <div className="mt-3 border-t border-bad/40 pt-2 text-bad">
      <p className="font-semibold">This permit grew its powers ({failures.length} {failures.length === 1 ? "way" : "ways"})</p>
      <ul className="mt-1 space-y-1">
        {failures.map((f) => (
          <li key={f.dimension}>
            <b>{f.dimension}</b>: {f.reason}
            <span className="block font-mono text-[0.65rem] text-muted">edge {edge} · {short(parent)} → {short(child)} · parent {f.parentValue} → child {f.childValue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RequestCard({ run }: { run: Run }) {
  const r = run.request;
  return (
    <div className="panel enter p-4 text-sm">
      <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted">Signed request · {short(run.chain[run.chain.length - 1].subjectName)}</p>
      <p className="font-display text-xl font-semibold">Pay <span className="font-mono">{usdc(r.amount)}</span> → <span className="font-mono">{r.target}</span></p>
      <div className="mt-2">
        <Field k="Action">{r.action}</Field>
        <Field k="For service">{r.audience}</Field>
        <Field k="Valid until">{time(Number(r.deadline))}</Field>
        <Field k="One-time code"><Hash value={r.nonce} /></Field>
      </div>
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

const MARK: Record<CheckStatus, [string, string]> = {
  pass: ["✓", "text-lime"], fail: ["✗", "text-bad"], "not reached": ["–", "text-muted"], "skipped (mock)": ["?", "text-warn"],
};

export function Gatekeeper({ run }: { run: Run }) {
  const v = run.verdict;
  const st = checkStatuses(v, run.mock);
  return (
    <div className={`panel p-4 ${v.ok ? "" : "border-bad/50"}`}>
      <p className="mb-3 flex items-center justify-between font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        <span>Breaker · POST /execute{run.mock ? " · simulated" : ""}</span>
        <span className={`rounded-full border px-2 py-0.5 ${v.ok ? "border-lime text-lime" : "border-bad text-bad"}`}>{v.ok ? "closed" : "tripped"}</span>
      </p>
      <ol className="space-y-2.5">
        {CHECKS.map((c, i) => {
          const [mark, color] = MARK[st[i]];
          return (
            <li key={c.title} className="enter grid grid-cols-[1.25rem_1fr] gap-x-2" style={delay(i * 180)}>
              <span className={`font-mono text-base font-bold leading-5 ${color}`} aria-hidden>{mark}</span>
              <div>
                <p className="text-sm">{c.title} <span className={`ml-1 font-mono text-[0.65rem] uppercase ${color}`}>{st[i]}</span></p>
                <p className="font-mono text-[0.65rem] text-muted">{c.rule}</p>
                {st[i] === "fail" && !v.ok && (
                  <div className="mt-1 font-mono text-[0.7rem] text-bad">
                    <p>{v.code}: {v.detail}</p>
                    {v.edges?.map((e) => e.failures.map((f) => (
                      <p key={`${e.edge}${f.dimension}`}>edge {e.edge} · <b>{f.dimension}</b>: {f.reason} ({f.parentValue} → {f.childValue})</p>
                    )))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-bad">Asked</p>
          <p className="font-display text-3xl font-bold text-bad md:text-4xl">{usdc(asked)}</p>
        </div>
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-lime">Allowed</p>
          <p className="font-display text-3xl font-bold text-lime md:text-4xl">{usdc(allowed)}</p>
        </div>
      </div>
      <div className="relative h-7" role="img" aria-label={`${usdc(allowed)} allowed, ${usdc(asked - allowed)} over the limit`}>
        <div className="absolute inset-y-0 left-0 z-10 rounded-l border border-lime bg-lime/80" style={{ width: `${boxPct}%` }} />
        <div className="spill absolute inset-y-1 right-0 rounded-r bg-bad/80" style={{ left: `${boxPct}%` }} />
      </div>
      <p className="font-mono text-xs text-bad">+{usdc(asked - allowed)} over the limit</p>
    </div>
  );
}

/** Snapped wire with a spark: drawn when the breaker trips. */
function SnappedWire() {
  return (
    <svg aria-hidden viewBox="0 0 220 40" className="h-10 w-full">
      <line x1="0" y1="20" x2="92" y2="20" stroke="var(--color-lime)" strokeWidth="4" strokeLinecap="round" />
      <path d="M100 8 L108 20 L102 22 L112 34" fill="none" stroke="var(--color-bad)" strokeWidth="2" strokeLinejoin="round" />
      <line x1="128" y1="20" x2="220" y2="20" stroke="var(--color-line)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The result: EXECUTED with receipt, or TRIPPED with every reason and "No money moved". */
export function Verdict({ run }: { run: Run }) {
  const v = run.verdict;
  const r = run.request;
  const shot = moneyShot(run);
  return (
    <div className={`panel enter space-y-4 p-5 ${v.ok ? "border-lime/60" : "border-bad/60"}`}>
      {v.ok ? (
        <>
          <p className="font-display text-5xl font-bold text-lime">EXECUTED</p>
          <p className="text-sm">Paid {usdc(r.amount)} to {r.target}.</p>
          {run.txHash && (run.mock
            ? <p className="text-xs">Receipt <span className="font-mono">{short(run.txHash)}</span> <Badge tone="warn">Mock tx · no Etherscan link</Badge></p>
            : <p className="text-xs">Receipt <Hash value={run.txHash} /> · <a className="text-lime underline" href={`${ETHERSCAN}/tx/${run.txHash}`} target="_blank" rel="noreferrer">View on Sepolia Etherscan</a></p>)}
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <p className="font-display text-5xl font-bold text-bad">TRIPPED</p>
            <div className="min-w-24 flex-1"><SnappedWire /></div>
          </div>
          <p className="font-display text-2xl font-semibold">DENIED. No money moved.</p>
          <p className="text-xs text-muted">Balance unchanged. No money moved.</p>
          {v.code === "REVOKED" && <p className="font-mono text-sm font-semibold text-bad">REVOKED UPSTREAM</p>}
          {shot && <MoneyShot asked={shot.asked} allowed={shot.allowed} />}
          <p className="font-mono text-[0.7rem] text-bad">{v.code}: {v.detail}</p>
        </>
      )}
      {run.stepUp.required && (
        <p className="border-t border-line pt-2 text-xs">
          World ID approval required above $15:{" "}
          {run.stepUp.approvedNonce === r.nonce ? <Badge tone="ok">Approved for this exact request</Badge> : <Badge tone="bad">Not approved for this request</Badge>}
        </p>
      )}
    </div>
  );
}

export function Timeline({ runs, selected, onSelect }: { runs: Run[]; selected?: string; onSelect: (r: Run) => void }) {
  if (!runs.length) return null;
  return (
    <ol className="panel ruled max-h-64 overflow-y-auto px-3 text-xs">
      {runs.map((r) => (
        <li key={r.id} className="flex h-[2.4rem] items-center">
          <button type="button" onClick={() => onSelect(r)} className={`flex w-full items-center gap-3 text-left ${r.id === selected ? "text-lime" : ""}`}>
            <span className="w-20 shrink-0 font-mono text-muted">{new Date(r.at * 1000).toLocaleTimeString("en-GB")}</span>
            <Badge tone={r.verdict.ok ? "ok" : "bad"}>{r.verdict.ok ? "Executed" : `Denied · ${r.verdict.code}`}</Badge>
            <span className="truncate font-mono">{usdc(r.request.amount)} → {r.request.target}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
