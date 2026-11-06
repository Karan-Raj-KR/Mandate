import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TicketTone = "live" | "grew" | "dead";

/** Bar length for a ceiling. Square root keeps 25 USDC visible next to 1,000. */
export const authority = (maxAmount: bigint) => Math.min(1, Math.sqrt(Number(maxAmount / 1_000_000n) / 1000));

/** A permit. One anatomy everywhere: who, ceiling, authority bar, terms, status. */
export function Ticket({ who, sub, amount, tone = "live", share, limit, foot, className, style, children }: { who: string; sub: string; amount?: string; tone?: TicketTone; share?: number; limit?: number; foot?: ReactNode; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div data-ui className={cn("ticket flex flex-col", `ticket-${tone}`, share !== undefined && "ticket-bar", className)} style={style}>
      <div className="h-[var(--stub)] shrink-0 px-4 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{who}</p>
            <p className="truncate font-mono text-xs text-muted" title={sub}>{sub}</p>
          </div>
          {amount && <p className="ticket-amount shrink-0 whitespace-nowrap text-right text-2xl font-medium leading-none tabular-nums tracking-tight">{amount.replace(" USDC", "")}<span className="block pt-1 text-xs font-normal tracking-normal text-muted">USDC max</span></p>}
        </div>
        {share !== undefined && (
          <span aria-hidden className="relative mt-3 block h-1.5 bg-white/12">
            <span className="bar-fill absolute inset-y-0 left-0 bg-fg" style={{ width: `${share * 100}%` }} />
            {limit !== undefined && <span className="tick absolute -inset-y-1 w-0.5" style={{ left: `${limit * 100}%` }} />}
          </span>
        )}
      </div>
      {(children || foot) && (
        <div className="ticket-body flex flex-1 flex-col px-4 pb-4 pt-3 text-sm">
          {children}
          {foot && <div className="mt-auto flex flex-col gap-1 pt-3">{foot}</div>}
        </div>
      )}
    </div>
  );
}

/** Label and value rows, aligned the same way on every permit. */
export function Terms({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
