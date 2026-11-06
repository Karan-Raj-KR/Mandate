"use client";
import type { Delegation, NarrowFailure } from "@mandate/core";
import { ETHERSCAN, type Run } from "@/lib/api";
import { Badge, Hash, short, time, usdc } from "./ui";

/** Plain text only: React escapes it, never dangerouslySetInnerHTML. */
export function PlainText({ label, text }: { label: string; text: string }) {
  return (
    <section className="rounded border border-line bg-white">
      <h3 className="border-b border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{text}</pre>
    </section>
  );
}

function Row({ k, bad, children }: { k: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex justify-between gap-3 px-1 ${bad ? "rounded bg-bad/10 outline outline-1 outline-bad" : ""}`}>
      <span className="text-muted">{k}</span>
      <span className="text-right font-mono">{children}</span>
    </div>
  );
}

/** One card per delegation hop. */
export function HopCard({ d, violations, revoked, ancestorRevoked, mock }: {
  d: Delegation; violations: NarrowFailure[]; revoked: boolean; ancestorRevoked: boolean; mock: boolean;
}) {
  const bad = new Set(violations.map((v) => v.dimension));
  return (
    <article className={`rounded border bg-white p-3 text-xs transition hover:shadow-sm ${violations.length || revoked ? "border-bad" : "border-line"}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold break-all">{d.subjectName}</span>
        <Hash value={d.subject} />
      </div>
      <p className="mb-2 text-muted">granted by {d.issuerName} · id {short(d.id)}</p>
      <div className="space-y-0.5">
        <Row k="actions" bad={bad.has("actions")}>{d.scope.actions.join(", ")}</Row>
        <Row k="maxAmount / request" bad={bad.has("maxAmount")}>{usdc(d.scope.maxAmount)}</Row>
        <Row k="expiry" bad={bad.has("expiry")}>{time(d.scope.expiry)}</Row>
        <Row k="targets" bad={bad.has("targets")}>{d.scope.targets.join(", ")}</Row>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {mock ? <Badge tone="warn">SIGNATURE: MOCK, NOT VERIFIED</Badge> : <Badge tone="ok">✓ SIGNATURE VALID</Badge>}
        {revoked ? <Badge tone="bad">REVOKED</Badge>
          : ancestorRevoked ? <Badge tone="bad">DENIED: ANCESTOR REVOKED</Badge>
          : <Badge tone="ok">NOT REVOKED{mock ? " (MOCK READ)" : ""}</Badge>}
      </div>
    </article>
  );
}

/** Every violation on one edge: dimension, reason, parent → child. */
function EdgeViolations({ parent, child, failures, edge }: { parent: string; child: string; failures: NarrowFailure[]; edge: number }) {
  return (
    <div className="rounded border-2 border-bad bg-bad/5 p-2 text-xs">
      <p className="font-semibold text-bad">AMPLIFICATION on edge {edge}: {parent} → {child}</p>
      <ul className="mt-1 space-y-1">
        {failures.map((f) => (
          <li key={f.dimension}>
            <b>{f.dimension}</b>: {f.reason}
            <span className="block font-mono text-muted">parent {f.parentValue} → child {f.childValue}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChainTree({ run }: { run: Run }) {
  const edges = run.verdict.ok ? [] : run.verdict.edges ?? [];
  const root = run.chain[0];
  const firstRevoked = run.revoked.indexOf(true);
  return (
    <div className="space-y-2">
      <div className="rounded border border-line bg-white p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-sm font-semibold">Owner · {root.issuerName}</span>
          <Hash value={root.issuer} />
        </div>
        <div className="mt-2 flex gap-2">
          <Badge tone="info">ROOT</Badge>
          <Badge tone={run.mock ? "warn" : "ok"}>WORLD-VERIFIED{run.mock ? " (MOCK)" : ""}</Badge>
        </div>
      </div>
      {run.chain.map((d, i) => {
        const e = edges.find((x) => x.edge === i);
        return (
          <div key={d.id} className="space-y-2">
            <div className="pl-4 text-muted" aria-hidden>↓</div>
            {e && <EdgeViolations edge={i} parent={run.chain[i - 1].subjectName} child={d.subjectName} failures={e.failures} />}
            <HopCard d={d} violations={e?.failures ?? []} revoked={run.revoked[i]} ancestorRevoked={firstRevoked >= 0 && i > firstRevoked} mock={run.mock} />
          </div>
        );
      })}
      <div className="pl-4 text-muted" aria-hidden>↓</div>
      <div className="rounded border border-ink bg-ink p-3 text-center font-mono text-xs text-paper">POST /execute · {run.request.audience}</div>
    </div>
  );
}

export function Decision({ run }: { run: Run }) {
  const v = run.verdict;
  const r = run.request;
  return (
    <div className="space-y-3 text-sm">
      <div className={`rounded border-2 p-3 ${v.ok ? "border-ok" : "border-bad"}`}>
        <p className={`text-2xl font-bold ${v.ok ? "text-ok" : "text-bad"}`}>{v.ok ? "EXECUTED" : "DENIED"}</p>
        {v.ok ? (
          run.txHash && (run.mock
            ? <p className="mt-1 text-xs">tx <span className="font-mono">{short(run.txHash)}</span> <Badge tone="warn">MOCK TX, NO ETHERSCAN LINK</Badge></p>
            : <p className="mt-1 text-xs">tx <Hash value={run.txHash} /> · <a className="text-accent underline" href={`${ETHERSCAN}/tx/${run.txHash}`} target="_blank" rel="noreferrer">Sepolia Etherscan ↗</a></p>)
        ) : (
          <>
            <p className="mt-1 font-mono text-xs font-semibold">{v.code}</p>
            <p className="text-xs">{v.detail}</p>
            {v.edges?.map((e) => (
              <ul key={e.edge} className="mt-2 space-y-1 text-xs">
                {e.failures.map((f) => (
                  <li key={f.dimension}>edge {e.edge} · <b>{f.dimension}</b>: {f.reason} <span className="font-mono text-muted">({f.parentValue} → {f.childValue})</span></li>
                ))}
              </ul>
            ))}
            <p className="mt-3 border-t border-line pt-2 text-xs font-semibold">No side effect: balance unchanged.</p>
          </>
        )}
      </div>

      {run.stepUp.required && (
        <div className="rounded border border-line bg-white p-3 text-xs">
          <p className="font-semibold">World ID approval required (above $15)</p>
          {run.stepUp.approvedNonce === r.nonce
            ? <p className="mt-1"><Badge tone="ok">APPROVED FOR THIS REQUEST</Badge> bound to nonce <Hash value={r.nonce} /></p>
            : <p className="mt-1"><Badge tone="bad">NOT APPROVED FOR THIS REQUEST</Badge></p>}
        </div>
      )}

      <div className="rounded border border-line bg-white p-3 text-xs">
        <p className="mb-1 font-semibold">Request</p>
        <Row k="action">{r.action}</Row>
        <Row k="amount">{usdc(r.amount)}</Row>
        <Row k="target">{r.target}</Row>
        <Row k="audience">{r.audience}</Row>
        <Row k="nonce"><Hash value={r.nonce} /></Row>
        <Row k="deadline">{time(Number(r.deadline))}</Row>
      </div>
    </div>
  );
}

export function Timeline({ runs, selected, onSelect }: { runs: Run[]; selected?: string; onSelect: (r: Run) => void }) {
  if (!runs.length) return <p className="text-xs text-muted">No requests yet.</p>;
  return (
    <ol className="max-h-72 space-y-1 overflow-y-auto text-xs">
      {runs.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onSelect(r)} className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left ${r.id === selected ? "border-ink" : "border-line"} bg-white`}>
            <Badge tone={r.verdict.ok ? "ok" : "bad"}>{r.verdict.ok ? "EXECUTED" : `DENIED: ${r.verdict.code}`}</Badge>
            <span className="truncate">{r.scenario} · {usdc(r.request.amount)} → {r.request.target}</span>
            <span className="ml-auto shrink-0 text-muted">{new Date(r.at * 1000).toLocaleTimeString()}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
