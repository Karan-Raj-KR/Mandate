import type { ReactNode } from "react";
import { Ticket } from "@/components/ticket";
import { cn } from "@/lib/utils";

function ring(r: number) {
  const pts: string[] = [];
  for (let d = 0; d < 360; d += 5) {
    const t = (d * Math.PI) / 180;
    const k = 1 + 0.16 * Math.sin(3 * t + r * 0.022) + 0.07 * Math.sin(5 * t - r * 0.031);
    pts.push(`${(300 + r * k * Math.cos(t)).toFixed(1)} ${(300 + r * k * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}
const RINGS = Array.from({ length: 36 }, (_, i) => ring(10 + i * 7)).join("");

/** Warped rings, drawn twice a few degrees apart so the lines interfere. */
export function Moire({ className, tone = "#ff6a50" }: { className?: string; tone?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 600 600" className={cn("will-change-transform", className)} style={{ maskImage: "radial-gradient(closest-side, #000 55%, transparent)" }}>
      <path d={RINGS} fill="none" stroke={tone} strokeWidth="2.6" />
      <path d={RINGS} fill="none" stroke={tone} strokeWidth="2.6" transform="rotate(4 300 300) translate(9 5)" opacity=".75" />
    </svg>
  );
}

/** Nested circles sharing a base: each holder sits inside the one above it. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="24" cy="24" r="22" /><circle cx="24" cy="30" r="16" /><circle cx="24" cy="36" r="10" /><circle cx="24" cy="41" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function Permit({ who, ens, amount, pay, className }: { who: string; ens: string; amount: string; pay: string; className?: string }) {
  return <Ticket who={who} sub={ens} amount={amount} className={cn("m-lift", className)}><p className="text-muted">Pays <span className="text-fg">{pay}</span></p></Ticket>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span data-ui className="inline-block bg-white/8 px-2.5 py-1.5 text-xs tabular-nums text-[#e3dad7]">{children}</span>;
}
