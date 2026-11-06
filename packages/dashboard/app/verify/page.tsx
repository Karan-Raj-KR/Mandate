"use client";
import { Moire } from "@/components/story/art";
import { authority, Terms, Ticket } from "@/components/ticket";
import { useState } from "react";

const DEFAULT_NAME = "settle.procure.ops.treasury.mandate-agents.eth";

type Row = { depth: number; status: string; reasons: string[]; d: { issuerName: string; subjectName: string; scope: { maxAmount: string; targets: string[]; actions: string[] } } };
type Result = { name: string; leafId: string; verified: boolean; rows: Row[] };

const usdc = (raw: string) => (Number(raw) / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 });

export default function VerifyPage() {
  const [name, setName] = useState(DEFAULT_NAME);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch(`/api/verify?name=${encodeURIComponent(name.trim())}`);
      const body = await res.json();
      if (res.ok) setResult(body);
      else setError(body.error ?? "verification failed");
    } catch {
      setError("could not reach the verifier");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="m-gutter pb-[calc(var(--frame)+3rem)]">
      <section className="m-band m-panel relative overflow-hidden">
        <Moire className="pointer-events-none absolute -right-[8%] -top-[30%] size-[min(60vw,46rem)] opacity-20" tone="#ffd2c8" />
        <h1 className="m-display relative text-[clamp(2rem,4.6vw,4.25rem)]">Verify from an ENS name</h1>
        <p className="relative mt-3 max-w-3xl">Live, not mock data. This reads the name's ENSv2 text records on Sepolia, fetches each delegation from Arkiv, re-checks every signature and hop, and reads revocation from Ethereum.</p>
        <form onSubmit={run} className="relative mt-6 flex flex-col gap-[3px] sm:flex-row">
          <label htmlFor="ens-name" className="sr-only">ENS name</label>
          <input id="ens-name" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} className="min-w-0 flex-1 border-0 border-b-2 border-white/25 bg-black/30 px-3 py-2 font-mono text-sm transition-colors duration-300 focus:border-[#ff5a40] focus:outline-none" />
          <button disabled={busy} className="m-btn disabled:opacity-50">{busy ? "Verifying…" : "Verify"}</button>
        </form>
      </section>
      <div aria-live="polite" className="mt-12">
        {error && <p className="paper p-4 text-sm"><strong className="text-bad">DENIED</strong>: {error}</p>}
        {result && (
          <section>
            <p className={`m-display text-4xl ${result.verified ? "text-ok" : "text-bad"}`}>{result.verified ? "VERIFIED" : "DENIED"}: {result.rows.length}-hop chain</p>
            <p className="mt-2 break-all font-mono text-xs text-muted">mandate:delegation-id {result.leafId}</p>
            <ol className="mt-5 grid grid-cols-1 gap-[3px] sm:grid-cols-2 xl:grid-cols-4">
              {result.rows.map((r) => (
                <li key={r.depth}>
                  <Ticket who={`Hop ${r.depth}: ${r.status}`} sub={r.d.subjectName} amount={usdc(r.d.scope.maxAmount)} tone={r.status === "USABLE" ? "live" : "dead"} share={authority(BigInt(r.d.scope.maxAmount))} className="h-full">
                    <Terms rows={[["From", <span key="f" className="break-all font-mono text-xs">{r.d.issuerName}</span>], ["To", <span key="t" className="break-all font-mono text-xs">{r.d.subjectName}</span>], ["May", r.d.scope.actions.join(", ")], ["Pay", r.d.scope.targets.join(", ")]]} />
                    {r.reasons.map((why) => <p key={why} className="mt-2 text-xs">{why}</p>)}
                  </Ticket>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
