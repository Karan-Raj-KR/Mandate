"use client";
import { useState } from "react";

const DEFAULT_NAME = "settle.procure.ops.treasury.mandate-agents.eth";

type Row = { depth: number; status: string; reasons: string[]; d: { issuerName: string; subjectName: string; scope: { maxAmount: string; targets: string[]; actions: string[] } } };
type Result = { name: string; leafId: string; verified: boolean; rows: Row[] };

const usdc = (raw: string) => `$${(Number(raw) / 1_000_000).toLocaleString("en-US")}`;

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
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-28">
      <h1 className="text-3xl font-semibold">Verify from an ENS name</h1>
      <p className="mt-3 opacity-75">Live, not mock data. This reads the name's ENSv2 text records on Sepolia, fetches each delegation from Arkiv, re-checks every signature and hop, and reads revocation from Ethereum.</p>
      <form onSubmit={run} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="ens-name" className="sr-only">ENS name</label>
        <input id="ens-name" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} className="min-w-0 flex-1 border border-current/30 bg-transparent px-3 py-2 font-mono text-sm" />
        <button disabled={busy} className="border border-current px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Verifying…" : "Verify"}</button>
      </form>
      <div aria-live="polite" className="mt-6">
        {error && <p className="border border-current/40 p-4 text-sm"><strong>DENIED</strong>: {error}</p>}
        {result && (
          <section>
            <p className="text-xl font-semibold">{result.verified ? "VERIFIED" : "DENIED"}: {result.rows.length}-hop chain</p>
            <p className="mt-1 break-all font-mono text-xs opacity-70">mandate:delegation-id {result.leafId}</p>
            <ol className="mt-4 space-y-3">
              {result.rows.map((r) => (
                <li key={r.depth} className="border border-current/30 p-3 text-sm">
                  <p className="font-medium">Hop {r.depth}: {r.status}</p>
                  <p className="mt-1 break-all font-mono text-xs">{r.d.issuerName} → {r.d.subjectName}</p>
                  <p className="mt-1 opacity-75">Up to {usdc(r.d.scope.maxAmount)} · {r.d.scope.actions.join(", ")} · targets {r.d.scope.targets.join(", ")}</p>
                  {r.reasons.map((why) => <p key={why} className="mt-1">{why}</p>)}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
