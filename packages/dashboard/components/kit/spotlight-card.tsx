"use client";
import { useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Hand-made spotlight card (Componentry has no spotlight-card): a faint highlight follows the cursor. */
export function SpotlightCard({ className, children, tone = "lime", ...p }: HTMLAttributes<HTMLDivElement> & { tone?: "lime" | "bad" | "off" }) {
  const ref = useRef<HTMLDivElement>(null);
  const glow = { lime: "rgba(198,255,61,.07)", bad: "rgba(255,77,77,.09)", off: "rgba(138,147,160,.04)" }[tone];
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--x", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--y", `${e.clientY - r.top}px`);
      }}
      className={cn("relative overflow-hidden rounded-xl border bg-panel", className)}
      style={{ backgroundImage: `radial-gradient(320px circle at var(--x, 50%) var(--y, 0%), ${glow}, transparent 70%)` }}
      {...p}
    >
      {children}
    </div>
  );
}
