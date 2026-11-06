"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { DenyCode, NarrowFailure, Verdict } from "@mandate/core";
import { ETHERSCAN, type Run } from "@/lib/api";
import { Badge, Hash, Monogram, Stamp, short, time, usdc } from "./ui";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });
const ROLE: Record<string, string> = { treasury: "Owner · human", ops: "Operations agent", procure: "Procurement agent · LLM", settle: "Settlement agent" };
const role = (ens: string) => ROLE[ens.split(".")[0]] ?? "Agent";

export function StageColumn({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="flex items-baseline gap-2 border-b border-ink pb-1 font-serif text-xl">
        <span className="font-mono text-xs text-muted">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

/** Plain text only: React escapes it, never dangerouslySetInnerHTML. */
export function PlainText({ label, text }: { label: string; text: string }) {
  return (
    <section className="sheet">
      <h3 className="border-b border-line px-3 py-1.5 font-mono text-[0.7rem] font-bold uppercase tracking-wider text-muted">{label}</h3>
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
    <div className="sheet slide-in relative p-4 shadow-[3px_3px_0_#1b1a1712]">
      <p className="mb-2 flex justify-between font-mono text-[0.7rem] uppercase tracking-wider text-muted">
        <span>Supplier invoice</span>
        {poisoned && <span className="font-bold text-bad">Hidden instruction</span>}
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {lines.map(({ line, flagged }, i) => (
          <span key={i} className="block">
            <span className={flagged ? "scribble text-bad" : ""}>{line || " "}</span>
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
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2 border-b border-dotted border-line py-0.5">
      <span className="text-[0.7rem] uppercase tracking-wider text-muted">{k}</span>
      <span className={`font-mono text-xs ${bad ? "font-bold text-bad underline decoration-wavy" : ""}`}>{children}</span>
    </div>
  );
}

/** Owner → permits, each drawn narrower; a permit that grew is drawn wider, in red. */
export function PermitChain({ run, showRevoked }: { run: Run; showRevoked: boolean }) {
  const edges = run.verdict.ok ? [] : run.verdict.edges ?? [];
  const root = run.chain[0];
  const firstRevoked = showRevoked ? run.revoked.indexOf(true) : -1;
  let width = 100;
  return (
    <div className="relative flex flex-col items-center gap-5">
      <div className="enter flex w-full items-center gap-3">
        <Monogram name={root.issuerName} dark />
        <div className="min-w-0">
          <p className="font-serif text-base">{role(root.issuerName)}</p>
          <p className="truncate font-mono text-xs">{root.issuerName}</p>
        </div>
        <span className="ml-auto"><Badge tone={run.mock ? "warn" : "ok"}>World-verified{run.mock ? " · mock" : ""}</Badge></span>
      </div>

      {run.chain.map((d, i) => {
        const failures = edges.find((e) => e.edge === i)?.failures ?? [];
        const bad = new Set(failures.map((f) => f.dimension));
        width = failures.length ? Math.min(width + 15, 112) : i === 0 ? 100 : width - 15;
        const revokedHere = firstRevoked === i;
        const voided = firstRevoked >= 0 && i > firstRevoked;
        return (
          <div key={d.id} className="enter relative w-full" style={delay(i * 260)}>
            {/* the revocation runs down through every child permit */}
            {voided && <div aria-hidden className="draw-down absolute -top-5 bottom-0 left-1/2 z-20 w-1 -translate-x-1/2 bg-bad" style={delay(300 + (i - firstRevoked) * 350)} />}
            <article
              className={`permit mx-auto w-(--wm) p-3 text-xs md:w-(--w) ${failures.length ? "!border-bad md:-ml-[6%]" : ""} ${voided ? "opacity-60" : ""}`}
              style={{ "--w": `${width}%`, "--wm": `${Math.min(width, 100)}%` } as CSSProperties}
            >
              <p className="mb-2 flex justify-between font-mono text-[0.65rem] uppercase tracking-widest text-muted">
                <span>Permit No. {short(d.id)}</span>
                <span>{i === 0 ? "root" : `level ${i}`}</span>
              </p>
              <div className="mb-2 flex items-center gap-2">
                <Monogram name={d.issuerName} />
                <span className="text-muted">→</span>
                <Monogram name={d.subjectName} dark />
                <div className="min-w-0">
                  <p className="font-serif text-sm leading-tight">{role(d.subjectName)}</p>
                  <p className="truncate font-mono text-[0.7rem] text-muted" title={d.subjectName}>{d.subjectName}</p>
                </div>
              </div>
              <Field k="Actions" bad={bad.has("actions")}>{d.scope.actions.join(", ")}</Field>
              <Field k="Max per request" bad={bad.has("maxAmount")}>{usdc(d.scope.maxAmount)}</Field>
              <Field k="Expires" bad={bad.has("expiry")}>{time(d.scope.expiry)}</Field>
              <Field k="Pay to" bad={bad.has("targets")}>{d.scope.targets.join(", ") === "*" ? "anyone (*)" : d.scope.targets.join(", ")}</Field>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`grid size-7 place-items-center rounded-full border-2 font-mono text-[0.5rem] font-bold ${run.mock ? "border-dashed border-warn text-warn" : "border-ok text-ok"}`} aria-hidden>SEAL</span>
                <span className="text-[0.7rem]">{run.mock ? "Signature not verified (mock fixture)" : "Signature verified"}</span>
                {voided && <Badge tone="bad">Void · parent revoked</Badge>}
              </div>
              {failures.length > 0 && <Violations edge={i} parent={run.chain[i - 1].subjectName} child={d.subjectName} failures={failures} />}
            </article>
            {revokedHere && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center"><Stamp tone="bad" big>Revoked</Stamp></div>
            )}
          </div>
        );
      })}

    </div>
  );
}

function Violations({ edge, parent, child, failures }: { edge: number; parent: string; child: string; failures: NarrowFailure[] }) {
  return (
    <div className="mt-2 border-t border-bad pt-2 text-bad">
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
    <div className="sheet enter p-4 text-sm">
      <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted">Payment request · signed by</p>
      <p className="mb-3 truncate font-mono text-xs">{run.chain[run.chain.length - 1].subjectName}</p>
      <p className="font-serif text-lg leading-snug">Pay <span className="font-mono font-semibold">{usdc(r.amount)}</span> to <span className="font-mono font-semibold">{r.target}</span></p>
      <div className="mt-3 space-y-0.5 text-xs">
        <Field k="Action">{r.action}</Field>
        <Field k="For service">{r.audience}</Field>
        <Field k="Valid until">{time(Number(r.deadline))}</Field>
        <Field k="One-time code"><Hash value={r.nonce} /></Field>
      </div>
    </div>
  );
}

// ---------- the gatekeeper: plain-English checks, technical detail underneath ----------

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

export function checkStatuses(v: Verdict, mock: boolean): CheckStatus[] {
  const failStep = v.ok ? Infinity : STEP[v.code];
  return CHECKS.map((c) => {
    if (!v.ok && c.steps.includes(failStep)) return "fail";
    if (mock && c.mockSkips) return "skipped (mock)";
    // step 16 is the transfer itself: it only matters if it is the step that failed
    return c.steps.filter((s) => s < 16).every((s) => s < failStep) ? "pass" : "not reached";
  });
}

const MARK: Record<CheckStatus, [string, string]> = {
  pass: ["✓", "text-ok"], fail: ["✗", "text-bad"], "not reached": ["–", "text-muted"], "skipped (mock)": ["?", "text-warn"],
};

export function Gatekeeper({ run }: { run: Run }) {
  const v = run.verdict;
  const st = checkStatuses(v, run.mock);
  return (
    <div className="sheet p-4">
      <p className="mb-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted">Payment service · POST /execute{run.mock ? " · simulated (mock)" : ""}</p>
      <ol className="space-y-2">
        {CHECKS.map((c, i) => {
          const [mark, color] = MARK[st[i]];
          return (
            <li key={c.title} className="enter grid grid-cols-[1.5rem_1fr] gap-x-2" style={delay(i * 180)}>
              <span className={`font-mono text-lg font-bold leading-none ${color}`} aria-hidden>{mark}</span>
              <div>
                <p className="text-sm font-medium">{c.title} <span className={`font-mono text-[0.65rem] uppercase ${color}`}>{st[i]}</span></p>
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
    <div className="sheet enter p-5 md:p-8">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-bad">Asked</p>
          <p className="font-mono text-4xl font-bold text-bad md:text-6xl">{usdc(asked)}</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-ok">Allowed</p>
          <p className="font-mono text-4xl font-bold text-ok md:text-6xl">{usdc(allowed)}</p>
        </div>
      </div>
      <div className="relative mt-6 h-10" role="img" aria-label={`${usdc(allowed)} allowed, ${usdc(asked - allowed)} over the limit`}>
        <div className="absolute inset-y-0 left-0 z-10 border-2 border-ink bg-ok/80" style={{ width: `${boxPct}%` }} />
        <div className="spill absolute inset-y-1 right-0 bg-bad/85" style={{ left: `${boxPct}%` }} />
        <span className="absolute -bottom-6 font-mono text-xs text-bad" style={{ left: `${boxPct}%` }}>+{usdc(asked - allowed)} over the limit</span>
      </div>
    </div>
  );
}

/** The verdict slip: stamp + receipt, or "No money moved". */
export function Verdict({ run }: { run: Run }) {
  const v = run.verdict;
  const r = run.request;
  return (
    <div className="sheet relative min-h-56 p-4 text-sm">
      <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">Decision</p>
      <p className="mt-1 font-serif text-lg">Pay {usdc(r.amount)} to {r.target}</p>
      <div className="my-5 text-center">
        <Stamp tone={v.ok ? "ok" : "bad"} big>{v.ok ? "Paid" : "Denied"}</Stamp>
      </div>
      {v.ok ? (
        run.txHash && (run.mock
          ? <p className="text-xs">Receipt <span className="font-mono">{short(run.txHash)}</span> <Badge tone="warn">Mock tx · no Etherscan link</Badge></p>
          : <p className="text-xs">Receipt <Hash value={run.txHash} /> · <a className="underline" href={`${ETHERSCAN}/tx/${run.txHash}`} target="_blank" rel="noreferrer">View on Sepolia Etherscan</a></p>)
      ) : (
        <>
          <p className="font-serif text-lg">Balance unchanged. No money moved.</p>
          <p className="mt-1 font-mono text-[0.7rem] text-bad">{v.code}: {v.detail}</p>
        </>
      )}
      {run.stepUp.required && (
        <p className="mt-3 border-t border-line pt-2 text-xs">
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
    <ol className="ruled sheet max-h-64 overflow-y-auto px-3 text-xs">
      {runs.map((r) => (
        <li key={r.id} className="flex h-[2.4rem] items-center">
          <button type="button" onClick={() => onSelect(r)} className={`flex w-full items-center gap-3 text-left ${r.id === selected ? "font-semibold" : ""}`}>
            <span className="w-20 shrink-0 font-mono text-muted">{new Date(r.at * 1000).toLocaleTimeString("en-GB")}</span>
            <Badge tone={r.verdict.ok ? "ok" : "bad"}>{r.verdict.ok ? "Paid" : `Denied · ${r.verdict.code}`}</Badge>
            <span className="truncate font-mono">{usdc(r.request.amount)} → {r.request.target}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
