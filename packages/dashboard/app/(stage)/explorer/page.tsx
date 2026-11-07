"use client";
import { useEffect, useState } from "react";
import { ACTIONS } from "@mandate/core";
import { Moire } from "@/components/story/art";
import { authority, Terms, Ticket } from "@/components/ticket";
import { Badge, Button, Hash, time, usdc } from "@/components/ui";
import { exploreAuthority, MOCK, type AuthorityRow } from "@/lib/api";

const input = "h-11 w-full min-w-0  border-0 border-b-2 border-white/25 bg-[#171211] px-3 text-fg text-sm focus:border-[#ff5a40] focus:outline-none transition-colors duration-300";

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
    <div className="space-y-12">
      <section className="m-band m-panel relative overflow-hidden">
        <Moire className="pointer-events-none absolute -right-[10%] -top-[30%] size-[min(60vw,46rem)] opacity-20" tone="#ffd2c8" />
        <h1 className="m-display relative text-[clamp(2rem,4.6vw,4.25rem)]">Live registry</h1>
        <p className="relative mt-3 max-w-3xl">Which permits under an owner can still be used right now? Each one is looked up, its signature and chain checked, and its revocation read from Ethereum. Only permits that pass everything are stamped usable.</p>
        <form className="relative mt-6 flex gap-[3px]" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input className={`${input} flex-1 font-mono`} value={root} onChange={(e) => setRoot(e.target.value)} aria-label="owner ENS name or root permit id" placeholder="owner ENS name or root permit id (0x…)" />
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
          <section>
            <h2 className="m-serif mb-4 text-4xl">Filter</h2>
            <fieldset className="grid gap-[3px] text-xs text-muted sm:grid-cols-3 lg:grid-cols-5">
              <legend className="sr-only">Filters</legend>
              <label className="flex flex-col gap-1">Issued by<input className={input} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} /></label>
              <label className="flex flex-col gap-1">Held by<input className={input} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
              <label className="flex flex-col gap-1">Level
                <select className={input} value={f.depth} onChange={(e) => setF({ ...f, depth: e.target.value })}>
                  <option value="">any</option>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">Expires after (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
              <label className="flex flex-col gap-1">Expires before (unix s)<input className={`${input} font-mono`} inputMode="numeric" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
            </fieldset>
            <div role="group" aria-label="Allows all of" className="mt-3 flex flex-wrap items-center gap-[3px]">
              <span className="mr-3 text-xs text-muted">Allows all of</span>
              {ACTIONS.map((a) => {
                const on = f.actions.includes(a);
                return <Button key={a} tone={on ? "ink" : "plain"} aria-pressed={on} onClick={() => setF({ ...f, actions: on ? f.actions.filter((x) => x !== a) : [...f.actions, a] })}>{a}</Button>;
              })}
            </div>
          </section>

          <section>
            <h2 className="m-serif mb-4 text-4xl">Permits</h2>
            {!shown.length && <p className="text-muted">No permits match the filters.</p>}
            <div className="grid grid-cols-1 gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
              {shown.map((r) => {
                const s = stampOf(r);
                const notes = r.reasons.filter((x) => !x.startsWith("signature: mock"));
                return (
                  <Ticket
                    key={r.d.id} who={`${r.d.issuerName.split(".")[0]} → ${r.d.subjectName.split(".")[0]}`} sub={r.d.subjectName} amount={usdc(r.d.scope.maxAmount)}
                    tone={s.tone === "ok" ? "live" : s.label === "Denied" ? "grew" : "dead"} share={authority(r.d.scope.maxAmount)} className="m-lift"
                    foot={<Pill tone={s.tone}>{s.label}</Pill>}
                  >
                    <Terms rows={[
                      ["May", r.d.scope.actions.join(", ")],
                      ["Pay", r.d.scope.targets.join(", ")],
                      ["Until", time(r.d.scope.expiry)],
                      ["Level", r.depth],
                      ["Permit", <Hash key="h" value={r.d.id} />],
                    ]} />
                    <div className="mt-3 text-xs">
                      {notes.length ? notes.map((n) => <p key={n} className="mt-1 break-words">{n}</p>) : <p className="text-muted">{MOCK ? "Signature not verified (mock fixture)" : "All checks passed"}</p>}
                    </div>
                  </Ticket>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}


/** Status pill: colour AND text. */
function Pill({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>;
}
