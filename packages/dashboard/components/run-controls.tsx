"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

type Action = { key: string; label: string };

/**
 * Live mode buttons. They run the same scripts as the terminal (pnpm pay, attack:*, seed) through /api/run,
 * which exists only in local development. In a deployed build the panel falls back to the terminal commands.
 */
export function RunControls() {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [running, setRunning] = useState("");
  const [result, setResult] = useState<{ label: string; output: string } | null>(null);

  useEffect(() => {
    fetch("/api/run", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setActions(j.enabled ? j.actions : []))
      .catch(() => setActions([]));
  }, []);

  async function run(a: Action) {
    setRunning(a.key);
    setResult(null);
    try {
      const r = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: a.key }) });
      const j = await r.json();
      setResult({ label: a.label, output: j.output ?? j.error ?? `HTTP ${r.status}` });
    } catch (e) {
      setResult({ label: a.label, output: e instanceof Error ? e.message : "request failed" });
    } finally {
      setRunning("");
    }
  }

  if (actions === null) return null;
  if (actions.length === 0)
    return <p className="text-sm text-muted">Live: start agents from a terminal (<span className="font-mono">pnpm pay 0.5 supplierA · pnpm attack:amplify · pnpm attack:revoke</span>); each decision plays here.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Try it against the live service:</span>
        {actions.map((a) => (
          <Button key={a.key} disabled={running !== ""} onClick={() => run(a)}>{running === a.key ? "Running…" : a.label}</Button>
        ))}
      </div>
      <p className="text-xs text-muted">Revoking sends a real transaction on Sepolia. Press “Reset the demo” afterwards to issue a fresh chain.</p>
      {result && <pre className="panel overflow-x-auto p-3 font-mono text-xs"><b>{result.label}</b>{"\n"}{result.output}</pre>}
    </div>
  );
}
