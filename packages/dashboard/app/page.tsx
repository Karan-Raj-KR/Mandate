"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gatekeeper, InvoiceSheet, PermitChain, RequestCard, StageColumn, Timeline, Typewriter, Verdict } from "@/components/chain";
import { ApprovalPanel, needsApproval } from "@/components/approval";
import { Button, Modal, useToast, usdc } from "@/components/ui";
import { fetchTimeline, MOCK, mock, mockRevokeRoot, mockRun, type Run } from "@/lib/api";

type Pick = 1 | 2 | 3 | "replay" | "stepup";
type Beat = "invoice" | "output" | "permits" | "revoke" | "request" | "checks" | "stamp";
const BEATS: Beat[] = ["invoice", "output", "permits", "request", "checks", "stamp"];
const REVOKE_BEATS: Beat[] = ["invoice", "output", "permits", "revoke", "request", "checks", "stamp"];
// default 700 ms; permits travel 650 ms per hop, checks tick 700 ms apart (6 checks)
const PAUSE: Partial<Record<Beat, number>> = { output: 1300, permits: 2200, checks: 4500 };

const SCENARIOS: { k: 1 | 2 | 3; title: string; line: string }[] = [
  { k: 1, title: "Honest invoice", line: "A normal invoice. Every agent stays inside its permit." },
  { k: 2, title: "Poisoned invoice", line: "A hidden line in the invoice tricks the AI into granting far more." },
  { k: 3, title: "Boss revokes", line: "The owner cancels the first permit. Everything below it stops working." },
];

const CAPTION: Record<Beat, (r: Run, p: Pick) => string> = {
  invoice: (_, p) => (p === 2 ? "A supplier invoice arrives. It hides an instruction." : "A supplier invoice arrives."),
  output: (_, p) => (p === 2 ? "The procurement AI reads it and obeys the hidden instruction." : "The procurement agent reads it and proposes a payment."),
  permits: (_, p) => (p === 2 ? "Each agent passes on a permit. The poisoned one grew instead of shrinking." : "A human gave an agent limited permission. Each agent passes on a smaller one."),
  revoke: () => "The owner revokes the first permit. Every permit below it dies with it.",
  request: (r) => `The last agent signs a request: pay ${usdc(r.request.amount)} to ${r.request.target}.`,
  checks: () => "The payment service checks every permit before any money moves.",
  stamp: (r) => (r.verdict.ok ? "Approved. The money moved." : "Denied. No money moved."),
};

const reduced = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function prepare(p: Pick): Run {
  if (p !== "replay") mock.revoked.clear();
  if (p === 1) return mockRun("legit", Math.floor(Date.now() / 1000));
  if (p === 2) return mockRun("amplify", Math.floor(Date.now() / 1000));
  if (p === 3) { mockRevokeRoot(); return mockRun("revoke", Math.floor(Date.now() / 1000)); }
  if (p === "replay") { if (!mock.lastExecuted) mockRun("legit", Math.floor(Date.now() / 1000)); return mockRun("replay", Math.floor(Date.now() / 1000)); }
  return mockRun("stepup", Math.floor(Date.now() / 1000));
}

export default function Stage() {
  const toast = useToast();
  const [pick, setPick] = useState<Pick>(2);
  const [run, setRun] = useState<Run | null>(null);
  const [beat, setBeat] = useState(0); // number of beats shown
  const [playing, setPlaying] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [worldOpen, setWorldOpen] = useState(false);
  const [liveError, setLiveError] = useState("");
  const beats = run?.scenario === "revoke" ? REVOKE_BEATS : BEATS;
  const shown = (b: Beat) => beats.indexOf(b) < beat;
  const done = beat >= beats.length;

  const load = useCallback((r: Run, p: Pick, autoplay: boolean) => {
    setRun(r); setPick(p); setRuns((rs) => [r, ...rs.filter((x) => x.id !== r.id)]);
    if (reduced()) { setBeat(r.scenario === "revoke" ? REVOKE_BEATS.length : BEATS.length); setPlaying(false); }
    else { setBeat(autoplay ? 1 : 0); setPlaying(autoplay); }
  }, []);
  const start = useCallback((p: Pick, autoplay = true) => load(prepare(p), p, autoplay), [load]);
  const reset = () => { mock.revoked.clear(); setRun(null); setBeat(0); setPlaying(false); };

  // timed beats
  useEffect(() => {
    if (!playing || !run) return;
    if (beat >= beats.length) { setPlaying(false); return; }
    const t = setTimeout(() => setBeat((b) => b + 1), PAUSE[beats[beat - 1]] ?? 700);
    return () => clearTimeout(t);
  }, [playing, beat, run, beats]);

  // toast when the stamp lands
  const stamped = useRef<string>("");
  useEffect(() => {
    if (run && done && stamped.current !== run.id) {
      stamped.current = run.id;
      toast(run.verdict.ok ? `PAID: ${usdc(run.request.amount)} → ${run.request.target}` : `DENIED: ${run.verdict.code}`, run.verdict.ok ? "ok" : "bad");
    }
  }, [run, done, toast]);

  // opening state, or ?play=1|2|3 (add &final=1 to jump to the last beat)
  useEffect(() => {
    if (!MOCK) return;
    const q = new URLSearchParams(location.search);
    const p = Number(q.get("play")) as 1 | 2 | 3;
    const r = prepare([1, 2, 3].includes(p) ? p : 2);
    if (q.get("final") || !q.get("play")) { load(r, [1, 2, 3].includes(p) ? p : 2, false); setBeat(99); }
    else load(r, p, true);
  }, [load]);

  // keyboard: 1/2/3 pick, Space next beat, R reset
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (!MOCK || (e.target as HTMLElement).closest("input,textarea,select,dialog")) return;
    if (e.key === "1" || e.key === "2" || e.key === "3") start(Number(e.key) as 1 | 2 | 3, false);
    else if (e.key === " ") {
      e.preventDefault();
      setPlaying(false);
      if (!run || done) start(pick, false), setBeat(1);
      else setBeat((b) => b + 1);
    } else if (e.key.toLowerCase() === "r") reset();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  // live cross-app demo: play each new request the service decides
  useEffect(() => {
    if (MOCK) return;
    let last = "";
    const tick = () =>
      fetchTimeline()
        .then((rs) => {
          setLiveError("");
          setRuns(rs);
          if (rs[0] && rs[0].id !== last) { last = rs[0].id; load(rs[0], rs[0].scenario === "amplify" ? 2 : rs[0].scenario === "revoke" ? 3 : 1, true); }
        })
        .catch((e: Error) => setLiveError(e.message));
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [load]);

  const caption = run && beat > 0 ? CAPTION[beats[Math.min(beat, beats.length) - 1]](run, pick) : "Pick a scenario and press Play (or Space).";

  return (
    <div className="space-y-6">
      {/* scenario bar */}
      <div className="flex flex-wrap items-stretch gap-3">
        {/* segmented control; the active segment shows playback progress */}
        <div role="radiogroup" aria-label="Scenario" className="panel flex min-w-0 flex-1 flex-wrap gap-1 p-1">
          {SCENARIOS.map((s) => {
            const active = pick === s.k;
            return (
              <button
                key={s.k} type="button" role="radio" aria-checked={active} disabled={!MOCK} onClick={() => start(s.k)}
                className={`relative min-w-52 flex-1 overflow-hidden rounded-lg px-4 py-2.5 text-left transition-colors disabled:opacity-50 ${active ? "bg-lime/10" : "hover:bg-line/50"}`}
              >
                <span className={`font-mono text-xs ${active ? "text-lime" : "text-muted"}`}>0{s.k}</span> <span className="font-display text-lg font-semibold">{s.title}</span>
                <span className="block text-xs text-muted">{s.line}</span>
                {active && <span aria-hidden className="absolute bottom-0 left-0 h-0.5 bg-lime transition-[width] duration-500" style={{ width: `${Math.min(1, beat / beats.length) * 100}%` }} />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col justify-center gap-1">
          <Button tone="ink" disabled={!MOCK} onClick={() => start(pick)} className="px-6 text-base">{playing ? "Playing…" : "Play"}</Button>
          <p className="font-mono text-[0.65rem] text-muted">1 2 3 pick · Space next · R reset</p>
        </div>
      </div>

      {liveError && <p className="panel border-bad p-2 text-sm text-bad">Can&apos;t read the payment service ({liveError}). Nothing is shown as paid until it answers.</p>}
      {!MOCK && <p className="text-sm text-muted">Live: start agents from a terminal (<span className="font-mono">pnpm pay 10 supplierA · pnpm attack:amplify · pnpm attack:revoke</span>); each decision plays here.</p>}

      {!MOCK && run && needsApproval(run) && <ApprovalPanel run={run} />}

      <p className="min-h-[2.5em] font-display text-2xl leading-snug md:text-3xl" aria-live="polite">{caption}</p>

      {run && (
        <div className="grid items-start gap-8 lg:grid-cols-2 2xl:grid-cols-[1fr_1.45fr_1.15fr]">
          <StageColumn n={1} title="The invoice">
            {shown("invoice") && <InvoiceSheet text={run.invoice} />}
            {shown("output") && <Typewriter label={run.agentOutput.label} text={run.agentOutput.text} />}
          </StageColumn>
          <StageColumn n={2} title="Authority, hop by hop">
            {shown("permits") && <PermitChain run={run} showRevoked={shown("revoke") || (beats === BEATS && shown("permits"))} />}
            {shown("request") && <RequestCard run={run} />}
          </StageColumn>
          <StageColumn n={3} title="The breaker">
            {shown("checks") && <Gatekeeper run={run} />}
            {shown("stamp") && <Verdict run={run} />}
          </StageColumn>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <h2 className="mb-2 font-display text-xl">Request log</h2>
          <Timeline runs={runs} selected={run?.id} onSelect={(r) => { setRun(r); setBeat(99); setPlaying(false); }} />
        </div>
        {MOCK && (
          <div className="space-y-2 text-sm">
            <h2 className="font-display text-xl">Also try</h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => start("replay")}>Replay the last payment</Button>
              <Button onClick={() => setWorldOpen(true)}>Pay 20.00 USDC (needs a human)</Button>
            </div>
          </div>
        )}
      </div>

      <Modal open={worldOpen} title="Human approval (World ID)" onClose={() => setWorldOpen(false)}>
        <p className="text-sm">The settlement agent asks to pay <b className="font-mono">20.00 USDC → supplierA</b>. That is inside its permit but above 15.00 USDC, so a verified human must approve this exact request. Approving never widens a permit.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => { setWorldOpen(false); load(mockRun("stepup", Math.floor(Date.now() / 1000), false), "stepup", true); }}>Decline</Button>
          <Button tone="ink" onClick={() => { setWorldOpen(false); load(mockRun("stepup", Math.floor(Date.now() / 1000), true), "stepup", true); }}>Approve (mock)</Button>
        </div>
      </Modal>
    </div>
  );
}
