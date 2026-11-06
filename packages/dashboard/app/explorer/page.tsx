"use client";
import { useState } from "react";
import { ACTIONS } from "@mandate/core";
import { Badge, Button, Hash, time, usdc } from "@/components/ui";
import { exploreAuthority, MOCK, type AuthorityRow } from "@/lib/api";

const input = "rounded border border-line bg-white px-2 py-1 text-sm";

export default function Explorer() {
  const [root, setRoot] = useState("treasury.dhruv.eth");
  const [rows, setRows] = useState<AuthorityRow[] | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ issuer: "", subject: "", actions: [] as string[], depth: "", from: "", to: "" });

  const search = () => {
    setError("");
    exploreAuthority(root.trim(), Math.floor(Date.now() / 1000))
      .then(setRows)
      .catch((e: Error) => { setRows(null); setError(e.message); });
  };

  const shown = (rows ?? []).filter(({ d, depth }) =>
    (!f.issuer || d.issuerName.includes(f.issuer) || d.issuer.toLowerCase().includes(f.issuer.toLowerCase())) &&
    (!f.subject || d.subjectName.includes(f.subject) || d.subject.toLowerCase().includes(f.subject.toLowerCase())) &&
    f.actions.every((a) => (d.scope.actions as string[]).includes(a)) &&
    (f.depth === "" || depth === Number(f.depth)) &&
    (!f.from || d.scope.expiry >= Number(f.from)) &&
    (!f.to || d.scope.expiry <= Number(f.to)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Authority Explorer</h1>
        <p className="text-sm text-muted">What authority exists under this root right now? Arkiv query → local signature and structure checks → revocation on Sepolia. USABLE only if all pass.</p>
      </div>

      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input className={`${input} min-w-64 flex-1 font-mono`} value={root} onChange={(e) => setRoot(e.target.value)} aria-label="root id or ENS name" placeholder="root id (0x…) or ENS name" />
        <Button tone="accent" type="submit">Query</Button>
      </form>

      {error && (
        <p className="rounded border border-bad p-2 text-sm">
          <Badge tone="bad">DENIED</Badge> {error}. Nothing under this root is shown as usable.
        </p>
      )}

      {rows && (
        <>
          <fieldset className="grid gap-2 rounded border border-line bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-6">
            <legend className="px-1 font-semibold">Filters</legend>
            <label className="flex flex-col gap-1">issuer<input className={input} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></label>
            <label className="flex flex-col gap-1">subject<input className={input} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
            <label className="flex flex-col gap-1">actions (all of)
              <select multiple className={input} value={f.actions} onChange={(e) => setF({ ...f, actions: [...e.target.selectedOptions].map((o) => o.value) })}>
                {ACTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">depth (one of)
              <select className={input} value={f.depth} onChange={(e) => setF({ ...f, depth: e.target.value })}>
                <option value="">any</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">expiry from (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
            <label className="flex flex-col gap-1">expiry to (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          </fieldset>

          <ul className="space-y-2">
            {shown.map(({ d, depth, status, reasons }) => (
              <li key={d.id} className={`rounded border bg-white p-3 text-xs ${status === "USABLE" ? "border-line" : "border-bad"}`} style={{ marginLeft: `${depth * 1.25}rem` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={status === "USABLE" ? "ok" : "bad"}>{status}{MOCK && status === "USABLE" ? " (MOCK)" : ""}</Badge>
                  <span className="font-mono font-semibold break-all">{d.issuerName} → {d.subjectName}</span>
                  <span className="text-muted">depth {depth}</span>
                  <span className="ml-auto"><Hash value={d.id} /></span>
                </div>
                <p className="mt-1 font-mono">{d.scope.actions.join(", ")} · ≤ {usdc(d.scope.maxAmount)} per request · {d.scope.targets.join(", ")} · until {time(d.scope.expiry)}</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {reasons.map((r) => <li key={r} className={r.startsWith("signature: mock") ? "" : "text-bad"}>{r}</li>)}
                </ul>
              </li>
            ))}
            {!shown.length && <li className="text-sm text-muted">No delegations match the filters.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
