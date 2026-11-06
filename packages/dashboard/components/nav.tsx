"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { Mark } from "@/components/story/art";
import { PresenterToggle } from "@/components/ui";
import { MOCK } from "@/lib/api";
import { LIMITS } from "@/lib/limits";

const LINKS = [
  { href: "/story", label: "Story" },
  { href: "/", label: "Demo" },
  { href: "/explorer", label: "Registry" },
  { href: "/verify", label: "Verify" },
];

export function Frame() {
  return (
    <>
      <div aria-hidden className="m-frame" />
      <div aria-hidden className="m-edge" />
    </>
  );
}

export function Nav() {
  const path = usePathname();
  const [hover, setHover] = useState("");
  const lit = hover || path;
  return (
    <MotionConfig reducedMotion="user">
      <motion.nav
        aria-label="Main" onMouseLeave={() => setHover("")}
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-1/2 top-[calc(var(--frame)+0.75rem)] z-[60] flex -translate-x-1/2 items-center gap-0.5 whitespace-nowrap bg-[#141010] p-1 text-[13px] sm:gap-1 sm:px-2 sm:py-1.5 sm:text-sm"
      >
        <Link href="/story" aria-label="Mandate" className="grid size-8 place-items-center transition-transform duration-300 hover:rotate-12 sm:size-9"><Mark className="size-5" /></Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined} onMouseEnter={() => setHover(l.href)} onFocus={() => setHover(l.href)} className="relative px-1.5 py-2 sm:px-3">
            {lit === l.href && <motion.span layoutId="nav-lit" transition={{ type: "spring", stiffness: 380, damping: 32 }} className="absolute inset-x-1.5 bottom-1 h-0.5 bg-[#ff5a40] sm:inset-x-3" />}
            <span className="relative">{l.label}</span>
          </Link>
        ))}
        <details className="relative">
          <summary className="cursor-pointer list-none px-1.5 py-2 transition-colors hover:text-[#ffb4a8] sm:px-3">Limits</summary>
          <div className="paper absolute right-0 z-50 mt-3 w-[min(20rem,80vw)] whitespace-normal p-4 text-xs shadow-2xl">
            <p className="m-serif mb-2 text-xl">What Mandate does not promise</p>
            <ul className="list-disc space-y-1 pl-4 text-muted">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </details>
        <span className="hidden px-2 lg:block"><PresenterToggle /></span>
        {MOCK && <span className="mx-1.5 text-xs font-medium text-warn" title="NEXT_PUBLIC_SERVICE_URL is not set: these are fixtures, not live results">Mock<span className="hidden sm:inline"> data</span></span>}
      </motion.nav>
    </MotionConfig>
  );
}
