"use client";
import { useEffect, useState } from "react";
import { ChainTree, Decision, PlainText, Timeline } from "@/components/chain";
import { Badge, Button, Modal, useToast, usdc } from "@/components/ui";
import { fetchTimeline, MOCK, mock, mockRevokeRoot, mockRun, type Run, type Scenario } from "@/lib/api";

const now = () => Math.floor(Date.now() / 1000);
type RevokeStep = "idle" | "pending" | "confirmed" | "descendants denied";

export default function ChainView() {
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [sel, setSel] = useState<Run | null>(null);
  const [hero, setHero] = useState<Run | null>(null);
  const [modal, setModal] = useState<"revoke" | "world" | null>(null);
  const [revokeStep, setRevokeStep] = useState<RevokeStep>("idle");
  const [liveError, setLiveError] = useState("");

  const record = (r: Run) => {
    setRuns((rs) => [r, ...rs]);
    setSel(r);
    toast(r.verdict.ok ? `EXECUTED: ${usdc(r.request.amount)} → ${r.request.target}` : `DENIED: ${r.verdict.code}`, r.verdict.ok ? "ok" : "bad");
  };
  const run = (s: Scenario, worldApproved = false) => record(mockRun(s, now(), worldApproved));

  // Opening state: the amplification attack, already refused.
  useEffect(() => {
    if (!MOCK) return;
    const r = mockRun("amplify", now());
    setHero(r);
    setRuns([r]);
    setSel(r);
  }, []);

  // Live cross-app demo: poll the service's request timeline.
  useEffect(() => {
    if (MOCK) return;
    const tick = () =>
      fetchTimeline()
        .then((rs) => { setRuns(rs); setLiveError(""); setSel((s) => rs.find((x) => x.id === s?.id) ?? rs[0] ?? null); })
        .catch((e: Error) => setLiveError(e.message));
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, []);

  const revoke = () => {
    setModal(null);
    setRevokeStep("pending");
    toast("Revocation sent (mock tx)", "info");
    setTimeout(() => {
      mockRevokeRoot();
      setRevokeStep("confirmed");
      setTimeout(() => { run("revoke"); setRevokeStep("descendants denied"); }, 800);
    }, 1500);
  };

  const rogueAsk = hero?.request.amount;
  const authorized = hero?.chain[hero.chain.length - 2]?.scope.maxAmount;

  return (
    <div className="space-y-6">
      {hero && rogueAsk !== undefined && authorized !== undefined && (
        <p className="text-xl font-semibold leading-snug md:text-2xl">
          This agent signed a request for {usdc(rogueAsk)}. It was only authorized for {usdc(authorized)}.{" "}
          <span className="text-bad">The payment service refused.</span>
        </p>
      )}
      {liveError && <p className="rounded border border-bad p-2 text-sm text-bad">Timeline read failed: {liveError}. Nothing is shown as executed until the service answers.</p>}

      <AttackPanel run={run} revokeStep={revokeStep} openModal={setModal} />

      {sel ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Invoice</h2>
            <PlainText label="Invoice (plain text)" text={sel.invoice} />
            <PlainText label={sel.agentOutput.label} text={sel.agentOutput.text} />
            <p className="text-xs text-muted">Attempted: {sel.attempted}</p>
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Delegation chain</h2>
            <ChainTree run={sel} />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Decision</h2>
            <Decision run={sel} />
            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted">Request timeline</h2>
            <Timeline runs={runs} selected={sel.id} onSelect={setSel} />
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted">Waiting for the first request…</p>
      )}

      <Modal open={modal === "revoke"} title="Revoke Owner → Operations?" onClose={() => setModal(null)}>
        <p className="text-sm">One transaction, one bytes32 in the owner&apos;s namespace. Every chain through Operations will be refused; no downstream delegation is touched.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button tone="bad" onClick={revoke}>Revoke</Button>
        </div>
      </Modal>
      <Modal open={modal === "world"} title="World ID approval" onClose={() => setModal(null)}>
        <p className="text-sm">Settlement asks to pay <b>20 USDC → supplierA</b>. That is inside its scope but above $15, so a human must approve this exact request. Approval never widens scope.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => { setModal(null); run("stepup", false); }}>Decline</Button>
          <Button tone="accent" onClick={() => { setModal(null); run("stepup", true); }}>Approve (mock)</Button>
        </div>
      </Modal>
    </div>
  );
}

function AttackPanel({ run, revokeStep, openModal }: {
  run: (s: Scenario) => void; revokeStep: RevokeStep; openModal: (m: "revoke" | "world") => void;
}) {
  if (!MOCK) {
    return (
      <section className="rounded border border-line bg-white p-3 text-sm">
        <h2 className="font-semibold">Attack controls</h2>
        <p className="text-xs text-muted">Live mode: run the agents from a terminal; results appear here as the service decides.</p>
        <pre className="mt-2 font-mono text-xs">pnpm pay 10 supplierA · pnpm attack:amplify · pnpm attack:revoke · pnpm attack:replay</pre>
      </section>
    );
  }
  const steps: RevokeStep[] = ["pending", "confirmed", "descendants denied"];
  return (
    <section className="rounded border border-line bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold">Attack controls <span className="font-normal text-muted">(fixtures)</span></h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run("legit")}>Legit invoice</Button>
        <Button onClick={() => run("amplify")}>Prompt-injected delegation</Button>
        <Button onClick={() => openModal("revoke")} disabled={revokeStep !== "idle"}>Revoke ancestor</Button>
        <Button onClick={() => { if (!mock.lastExecuted) run("legit"); run("replay"); }}>Replay last request</Button>
        <Button onClick={() => openModal("world")}>Request above $15</Button>
        {revokeStep !== "idle" && (
          <span className="flex items-center gap-1 text-xs">
            {steps.map((s, i) => (
              <Badge key={s} tone={steps.indexOf(revokeStep) >= i ? (s === "pending" ? "warn" : "bad") : "info"}>{s.toUpperCase()}</Badge>
            ))}
          </span>
        )}
      </div>
    </section>
  );
}
