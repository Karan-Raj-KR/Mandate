"use client";
import { useEffect, useState } from "react";
import { toWire } from "@mandate/core";
import type { Run } from "@/lib/api";
import { Badge, Button, usdc } from "@/components/ui";

/** A request the service denied only because it needs a human (World ID) approval. */
export const needsApproval = (r: Run) => !r.verdict.ok && r.verdict.code === "STEP_UP_REQUIRED";

/**
 * DEMO ONLY. Shown in live mode when the selected request was denied for needing a World ID approval.
 * The bypass button appears only if the payment service says it was started with WORLD_DEMO_BYPASS=1.
 * It re-sends the same signed request with a bypass flag. It is not World ID and is labelled that way everywhere.
 */
export function ApprovalPanel({ run }: { run: Run }) {
  const [bypass, setBypass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/approve", { cache: "no-store" }).then((r) => r.json()).then((j) => setBypass(j.bypass === true)).catch(() => setBypass(false));
  }, []);
  useEffect(() => setMsg(""), [run.id]);

  async function approve() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chain: toWire(run.chain), request: toWire(run.request) }),
      });
      const j = await r.json();
      if (j.error) setMsg(`Could not send: ${j.error}`);
      else if (j.status === 200) setMsg("Approved with the demo bypass. The payment went through and appears in the log.");
      else setMsg(`Still denied: ${j.body?.code ?? j.status}${j.body?.detail ? ` (${j.body.detail})` : ""}`);
    } catch (e) {
      setMsg(`Could not send: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel space-y-3 border-warn p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warn">needs a human</Badge>
        <span className="font-display text-lg font-medium">
          {usdc(run.request.amount)} → {run.request.target} is inside the permit but above the approval limit.
        </span>
      </div>
      <p className="text-sm text-muted">A verified human must approve this exact request. Approving never widens a permit.</p>
      {bypass ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button tone="ink" disabled={busy} onClick={approve}>{busy ? "Sending…" : "Bypass World ID (demo only)"}</Button>
          <span className="text-xs text-warn">Not a real approval. The payment will be stamped “demo-bypass”.</span>
        </div>
      ) : (
        <p className="text-sm text-muted">World ID approval is not available in this demo. Start the payment service with <span className="font-mono">WORLD_DEMO_BYPASS=1</span> to show the flow without it.</p>
      )}
      {msg && <p className="text-sm" role="status">{msg}</p>}
    </div>
  );
}
