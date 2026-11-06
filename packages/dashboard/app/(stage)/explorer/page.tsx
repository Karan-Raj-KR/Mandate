"use client";
import { useEffect, useState } from "react";
import { ACTIONS } from "@mandate/core";
import { Moire } from "@/components/story/art";
import { Badge, Button, Hash, time, usdc } from "@/components/ui";
import { exploreAuthority, MOCK, type AuthorityRow } from "@/lib/api";

const input = " border-0 border-b-2 border-white/25 bg-black/30 px-3 py-2 text-sm focus:border-[#ff5a40] focus:outline-none transition-colors duration-300";

/** USABLE only when every check passed; otherwise name why. Unreadable state is DENIED, never "unknown". */
function stampOf(r: AuthorityRow): { label: string; tone: "ok" | "bad" } {
  if (r.status === "USABLE") return { label: MOCK ? "Usable · mock" : "Usable", tone: "ok" };
  if (r.reasons.some((x) => x.startsWith("revoked"))) return { label: "Revoked", tone: "bad" };
  if (r.reasons.some((x) => x.startsWith("expired"))) return { label: "Expired", tone: "bad" };
  return { label: "Denied", tone: "bad" };
}

export default function Registry() {
  const [root, setRoot] = useState(MOCK ? "treasury.dhruv.eth" : "latest");
  const [rows, setRows] = useState<AuthorityRow[] | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ issuer: "", subject: "", actions: [] as string[], depth: "", from: "", to: "" });

  const search = () => {
    setError("");
    exploreAuthority(root.trim(), Math.floor(Date.now() / 1000))
      .then(setRows)
      .catch((e: Error) => { setRows(null); setError(e.message); });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(search, []); // open on the demo owner's permits

  const shown = (rows ?? []).filter(({ d, depth }) =>
    (!f.issuer || d.issuerName.includes(f.issuer) || d.issuer.toLowerCase().includes(f.issuer.toLowerCase())) &&
    (!f.subject || d.subjectName.includes(f.subject) || d.subject.toLowerCase().includes(f.subject.toLowerCase())) &&
    f.actions.every((a) => (d.scope.actions as string[]).includes(a)) &&
    (f.depth === "" || depth === Number(f.depth)) &&
    (!f.from || d.scope.expiry >= Number(f.from)) &&
    (!f.to || d.scope.expiry <= Number(f.to)));

  return (
    <div className="space-y-6">
      <section className="m-band m-panel relative overflow-hidden">
        <Moire className="m-spin pointer-events-none absolute -right-[10%] -top-[30%] size-[min(60vw,46rem)] opacity-20" tone="#ffd2c8" />
        <h1 className="m-display relative text-[clamp(2.5rem,7vw,7rem)]">Live registry</h1>
        <p className="relative mt-4 max-w-3xl text-lg">Which permits under an owner can still be used right now? Each one is looked up, its signature and chain checked, and its revocation read from Ethereum. Only permits that pass everything are stamped usable.</p>
        <form className="relative mt-8 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input className={`${input} min-w-64 flex-1 font-mono`} value={root} onChange={(e) => setRoot(e.target.value)} aria-label="owner ENS name or root permit id" placeholder="owner ENS name or root permit id (0x…)" />
        <Button tone="ink" type="submit">Look up</Button>
        </form>
      </section>

      {error && (
        <div className="panel flex flex-wrap items-center gap-4 p-4">
          <Pill tone="bad">Denied · stale read</Pill>
          <p className="text-sm">{error}. Nothing under this owner is shown as usable.</p>
        </div>
      )}

      {rows && (
        <>
          <fieldset className="grid gap-4 text-xs text-muted sm:grid-cols-3 lg:grid-cols-6">
            <legend className="sr-only">Filters</legend>
            <label className="flex flex-col gap-1">Issued by<input className={input} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Held by<input className={input} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Allows all of
              <select multiple className={input} value={f.actions} onChange={(e) => setF({ ...f, actions: [...e.target.selectedOptions].map((o) => o.value) })}>
                {ACTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Level
              <select className={input} value={f.depth} onChange={(e) => setF({ ...f, depth: e.target.value })}>
                <option value="">any</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Expires after (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
            <label className="flex flex-col gap-1">Expires before (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          </fieldset>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[74rem] border-collapse text-left text-xs [&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_th]:px-3 [&_tbody_tr]:border-b [&_tbody_tr]:border-line [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-300 hover:[&_tbody_tr]:bg-white/3">
              <thead className="text-xs text-muted">
                <tr className="h-[2.4rem] border-b border-line">
                  <th>Status</th><th>Permit No.</th><th>Issued by → held by</th><th>Level</th><th>Actions</th><th>Max per request</th><th>Pay to</th><th>Expires</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const s = stampOf(r);
                  const notes = r.reasons.filter((x) => !x.startsWith("signature: mock"));
                  return (
                    <tr key={r.d.id}>
                      <td><Pill tone={s.tone}>{s.label}</Pill></td>
                      <td><Hash value={r.d.id} /></td>
                      <td className="whitespace-nowrap" style={{ paddingLeft: `${0.75 + r.depth}rem` }}>{r.d.issuerName.split(".")[0]} → {r.d.subjectName.split(".")[0]}</td>
                      <td className="tabular-nums">{r.depth}</td>
                      <td>{r.d.scope.actions.join(", ")}</td>
                      <td className="whitespace-nowrap tabular-nums">{usdc(r.d.scope.maxAmount)}</td>
                      <td>{r.d.scope.targets.join(", ")}</td>
                      <td className="whitespace-nowrap tabular-nums">{time(r.d.scope.expiry)}</td>
                      <td className={notes.length ? "text-bad" : "text-muted"}>
                        {notes.length ? notes.map((n) => <p key={n}>{n}</p>) : MOCK ? "signature not verified (mock fixture)" : "all checks passed"}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={9} className="text-muted">No permits match the filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}


/** Status pill: colour AND text. */
function Pill({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}
