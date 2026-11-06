import Link from "next/link";
import { CircuitBoard } from "@/components/kit/circuit-board";
import { PresenterToggle } from "@/components/ui";
import { MOCK } from "@/lib/api";

// SPEC §12 limitations and non-goals
const LIMITS = [
  "Each limit is per request; there are no running budgets.",
  "A stolen owner key is not protected against.",
  "Harmful actions inside the granted limits are still allowed.",
  "A completed payment cannot be undone.",
  "Services that skip the check are not protected.",
  "Revocation is only as fresh as the last registry read.",
  "Replay protection lives in memory and resets on restart.",
  "The payment adapter is run by the backend.",
  "The LLM agent shows the threat; it is not part of the guarantee.",
];

// decorative traces: owner → agents → breaker, left to right
const NODES = [
  { id: "a", x: 120, y: 22, size: "sm" as const }, { id: "b", x: 420, y: 58, size: "sm" as const },
  { id: "c", x: 760, y: 18, size: "sm" as const }, { id: "d", x: 1100, y: 56, size: "sm" as const },
  { id: "e", x: 1440, y: 20, size: "sm" as const }, { id: "f", x: 1800, y: 54, size: "sm" as const },
];
const LINKS = ["ab", "bc", "cd", "de", "ef"].map(([from, to]) => ({ from, to, pulseColor: "rgba(198,255,61,.55)" }));

export function SiteHeader() {
  return (
    <header className="relative z-40 border-b border-line bg-panel">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-35 motion-reduce:hidden">
        <CircuitBoard nodes={NODES} connections={LINKS} width={1920} height={76} showGrid={false} variant="dark" traceWidth={1} pulseSpeed={4} traceColor="rgba(138,147,160,.18)" />
      </div>
      <div className="relative mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 md:px-8">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight">
          Mandate<span className="text-lime">.</span>
        </Link>
        <span className="text-sm text-muted">Agents can subcontract work. Authority must not expand.</span>
        <nav className="ml-auto flex flex-wrap items-center gap-5 text-sm">
          <Link href="/" className="hover:text-lime">Stage</Link>
          <Link href="/explorer" className="hover:text-lime">Registry</Link>
          <details className="relative">
            <summary className="cursor-pointer list-none hover:text-lime">Trust limits</summary>
            <div className="panel absolute right-0 z-50 mt-3 w-80 p-4 text-xs shadow-2xl">
              <p className="mb-2 font-display text-base">What Mandate does not promise</p>
              <ul className="list-disc space-y-1 pl-4 text-muted">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          </details>
          <PresenterToggle />
          {MOCK && (
            <span className="rounded-full border border-warn px-2 py-0.5 font-mono text-[0.7rem] font-semibold text-warn" title="NEXT_PUBLIC_SERVICE_URL is not set: these are fixtures, not live results">
              MOCK DATA
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
