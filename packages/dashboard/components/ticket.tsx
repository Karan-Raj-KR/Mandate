import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TicketTone = "live" | "grew" | "dead";

/** A permit as a perforated ticket. Callers set its width: on the stage, width is authority. */
export function Ticket({ who, sub, amount, tone = "live", className, style, children }: { who: string; sub: string; amount: string; tone?: TicketTone; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div data-ui className={cn("ticket", `ticket-${tone}`, className)} style={style}>
      <div className="flex h-[var(--stub)] items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{who}</p>
          <p className="truncate font-mono text-xs text-muted" title={sub}>{sub}</p>
        </div>
        <p className="ticket-amount shrink-0 whitespace-nowrap text-right text-xl font-medium leading-none tabular-nums tracking-tight md:text-2xl">{amount.replace(" USDC", "")}<span className="block pt-1 text-xs font-normal tracking-normal text-muted">USDC max</span></p>
      </div>
      {children && <div className="ticket-body px-4 pb-4 pt-3 text-sm">{children}</div>}
    </div>
  );
}
