"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, MotionConfig, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { LIMITS } from "@/lib/limits";
import { Ticket } from "@/components/ticket";
import { Chip, Moire, Mark, Permit } from "./art";

type P = MotionValue<number>;

const EASE = [0.16, 1, 0.3, 1] as const;
const SPRING = { stiffness: 110, damping: 28, mass: 0.4, restDelta: 0.0005 };

/** A section that holds the screen for `screens` viewports and hands its scroll progress to the scene. */
function Pin({ screens, rest = 1, id, children }: { screens: number; rest?: number; id?: string; children: (p: P) => ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const smooth = useSpring(scrollYProgress, SPRING);
  const still = useMotionValue(rest);
  return (
    <section ref={ref} id={id} className="relative" style={{ height: reduced ? undefined : `${screens * 100}svh` }}>
      <div className={reduced ? "relative min-h-svh overflow-hidden" : "sticky top-0 h-svh overflow-hidden"}>{children(reduced ? still : smooth)}</div>
    </section>
  );
}

function Lit({ p, at, children }: { p: P; at: [number, number]; children: ReactNode }) {
  const opacity = useTransform(p, at, [0.14, 1]);
  return <motion.span style={{ opacity }}>{children}</motion.span>;
}

function Rise({ i = 0, className, children }: { i?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10%" }} transition={{ duration: 0.9, delay: i * 0.09, ease: EASE }}>
      {children}
    </motion.div>
  );
}

function Hero({ p }: { p: P }) {
  const fade = useTransform(p, [0.45, 1], [1, 0]);
  const visibility = useTransform(fade, (v) => (v < 0.02 ? "hidden" : "visible"));
  const rotateX = useTransform(p, [0, 1], [34, 0]);
  const rotateZ = useTransform(p, [0, 1], [-16, 0]);
  const y = useTransform(p, [0, 1], ["0vh", "-14vh"]);
  const lift = useTransform(p, [0, 1], ["0vh", "-30vh"]);
  const spin = useTransform(p, [0, 1], [0, 50]);
  return (
    <motion.div style={{ opacity: fade, visibility }} className="m-hero absolute inset-0">
      <motion.div style={{ rotate: spin }} className="pointer-events-none absolute left-1/2 top-[52%] -ml-[min(42vw,30rem)] -mt-[min(42vw,30rem)] size-[min(84vw,60rem)]"><Moire className="m-spin size-full opacity-25" tone="#ffd2c8" /></motion.div>
      <motion.div style={{ y: lift }} className="relative z-10 pt-[calc(var(--frame)+5.5rem)] text-center">
        <h1 aria-label="mandate" className="m-display text-[clamp(4rem,15vw,15rem)]">
          {"mandate".split("").map((c, i) => (
            <motion.span key={i} aria-hidden className="inline-block" initial={{ opacity: 0, y: 44 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: i * 0.04, ease: EASE }}>{c}</motion.span>
          ))}
        </h1>
        <motion.p className="m-gutter mt-3 text-xl font-medium" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3, ease: EASE }}>Authority for AI agents that can only shrink.</motion.p>
      </motion.div>
      <div className="absolute inset-x-0 bottom-[8%] z-10 flex justify-center [perspective:1400px]">
        <motion.div style={{ rotateX, rotateZ, y }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.25 }} className="m-float w-[min(70vw,27rem)] space-y-[3px]">
          <Permit who="Operations agent" ens="ops.treasury.dhruv.eth" amount="500.00" pay="anyone" />
          <Permit who="Procurement agent" ens="procure.ops.treasury.dhruv.eth" amount="100.00" pay="supplierA, supplierB" className="w-[84%]" />
          <Permit who="Settlement agent" ens="settle.procure.ops.treasury.dhruv.eth" amount="25.00" pay="supplierA" className="w-[68%]" />
        </motion.div>
      </div>
      <div className="absolute bottom-[calc(var(--frame)+1.25rem)] right-[calc(var(--frame)+1.25rem)] z-20 flex items-center gap-4 bg-[#0a0a0c]/70 p-3 pl-4 text-sm">
        <span className="hidden sm:block">Built at ETHGlobal<br />Mumbai 2026</span>
        <Link href="/" className="m-btn">Run the demo</Link>
      </div>
    </motion.div>
  );
}

function Layer({ p, at, who, amount, terms, className, children }: { p: P; at: [number, number]; who: string; amount: string; terms: string; className: string; children?: ReactNode }) {
  const opacity = useTransform(p, at, [0, 1]);
  const scale = useTransform(p, at, [0.9, 1]);
  const y = useTransform(p, at, [36, 0]);
  return (
    <motion.div data-ui style={{ opacity, scale, y }} className={` p-5 md:p-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium">{who}</p>
        <p className="text-2xl font-medium tabular-nums tracking-tight md:text-3xl">{amount}</p>
      </div>
      <p className="mt-1 text-sm opacity-80">{terms}</p>
      {children && <div className="mt-5">{children}</div>}
    </motion.div>
  );
}

function Nest({ p }: { p: P }) {
  const opacity = useTransform(p, [0.02, 0.2], [0, 1]);
  const y = useTransform(p, [0.02, 0.2], [32, 0]);
  return (
    <div className="m-gutter grid min-h-svh content-center items-center gap-8 pt-20 md:grid-cols-[1fr_1.15fr] md:gap-16 md:pt-0">
      <motion.h2 style={{ opacity, y }} className="m-display text-[clamp(2.4rem,5.6vw,6rem)]">Every hop holds less</motion.h2>
      <Layer p={p} at={[0.1, 0.36]} who="Operations agent" amount="500.00" terms="Pays anyone, for 24 hours" className="bg-[#1c1412]">
        <Layer p={p} at={[0.34, 0.6]} who="Procurement agent" amount="100.00" terms="Pays supplierA or supplierB, for 2 hours" className="bg-[#4a0d0a]">
          <Layer p={p} at={[0.58, 0.84]} who="Settlement agent" amount="25.00" terms="Pays supplierA, for 1 hour" className="bg-brand" />
        </Layer>
      </Layer>
    </div>
  );
}

function Opening({ p }: { p: P }) {
  const hero = useTransform(p, [0, 0.36], [0, 1]);
  const nest = useTransform(p, [0.36, 1], [0, 1]);
  return (
    <>
      <Nest p={nest} />
      <div className="absolute inset-0"><Hero p={hero} /></div>
    </>
  );
}

function Pill({ p, at, children }: { p: P; at: [number, number]; children: ReactNode }) {
  const scale = useTransform(p, at, [0.4, 1]);
  const opacity = useTransform(p, at, [0, 1]);
  return (
    <motion.span aria-hidden style={{ scale, opacity }} className="mx-[0.12em] inline-grid h-[0.8em] w-[1.5em] translate-y-[0.08em] place-items-center overflow-hidden border-2 border-fg align-baseline">
      {children}
    </motion.span>
  );
}

function Statement({ p }: { p: P }) {
  const art = useTransform(p, [0.1, 0.7], [0, 1]);
  const spin = useTransform(p, [0, 1], [-30, 30]);
  return (
    <div className="m-gutter flex min-h-svh items-center justify-center">
      <motion.div style={{ opacity: art, rotate: spin }} className="pointer-events-none absolute -right-[12vw] -top-[14vw] size-[44vw]"><Moire className="m-spin size-full" tone="#ff3b24" /></motion.div>
      <motion.div style={{ opacity: art, rotate: spin }} className="pointer-events-none absolute -bottom-[16vw] -left-[12vw] size-[36vw]"><Moire className="m-spin size-full" tone="#c4160f" /></motion.div>
      <h2 aria-label="Agents hire agents. Authority only shrinks." className="m-display relative text-[clamp(1.8rem,8.6vw,9rem)] leading-[1.08]">
        <span aria-hidden className="block">
          <Lit p={p} at={[0.04, 0.14]}>Agents</Lit><Pill p={p} at={[0.14, 0.26]}><Mark className="size-[0.55em]" /></Pill> <Lit p={p} at={[0.14, 0.24]}>hire</Lit>
        </span>
        <span aria-hidden className="block whitespace-nowrap pl-[0.5em] md:pl-[1.4em]">
          <Lit p={p} at={[0.24, 0.34]}>agents.</Lit><Pill p={p} at={[0.34, 0.46]}><span className="text-[0.4em] tabular-nums">500</span></Pill> <Lit p={p} at={[0.34, 0.46]}><span className="m-serif">Authority</span></Lit>
        </span>
        <span aria-hidden className="block pl-[0.5em]">
          <Lit p={p} at={[0.46, 0.56]}>only</Lit><Pill p={p} at={[0.56, 0.68]}><span className="text-[0.4em] tabular-nums">25</span></Pill> <Lit p={p} at={[0.6, 0.72]}>shrinks.</Lit>
        </span>
      </h2>
    </div>
  );
}

const WHY = "An agent that reads a poisoned invoice can be talked into asking for anything. Mandate does not try to make the model smarter. Every permit is signed, every hop must be narrower than the one above, and the service holding the money checks the whole chain before it acts.".split(" ");

function Why({ p }: { p: P }) {
  const y = useTransform(p, [0, 1], ["5vh", "-5vh"]);
  return (
    <motion.div style={{ y }} className="m-gutter grid min-h-svh content-center gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <p className="max-w-[34ch] text-[clamp(1.4rem,2.5vw,2.2rem)] font-medium leading-[1.22] tracking-tight">
        {WHY.map((w, i) => <Lit key={i} p={p} at={[0.08 + (i / WHY.length) * 0.72, 0.14 + (i / WHY.length) * 0.72]}>{w} </Lit>)}
      </p>
      <Lit p={p} at={[0.78, 0.9]}>
        <span className="m-display inline-flex items-center gap-3 text-[clamp(2.2rem,4.5vw,4.5rem)]">
          <span aria-hidden className="grid h-[0.9em] w-[1.5em] place-items-center border-2 border-fg"><Mark className="size-[0.6em]" /></span>Refused
        </span>
      </Lit>
    </motion.div>
  );
}

const DRIFT = [
  { left: "6%", at: 0, node: <Permit who="Operations agent" ens="ops.treasury.dhruv.eth" amount="500.00" pay="anyone" className="w-80" /> },
  { left: "60%", at: 0.07, node: <Permit who="Procurement agent" ens="procure.ops.treasury.dhruv.eth" amount="100.00" pay="supplierA, supplierB" className="w-80" /> },
  { left: "31%", at: 0.14, node: <Permit who="Settlement agent" ens="settle.procure.ops.treasury.dhruv.eth" amount="25.00" pay="supplierA" className="w-72" /> },
  { left: "72%", at: 0.22, node: <div data-ui className="w-64 bg-brand p-5 m-lift">Signed request<p className="mt-2 text-3xl font-medium tabular-nums tracking-tight">10.00 USDC</p>to supplierA</div> },
  { left: "12%", at: 0.3, node: <div data-ui className="w-64 border border-white/10 bg-panel p-5 m-lift"><p className="font-medium">One-time code</p><p className="mt-1 text-muted">A request can run once. A replay is refused.</p></div> },
];

function Drift({ p, left, at, children }: { p: P; left: string; at: number; children: ReactNode }) {
  const y = useTransform(p, [at, at + 0.7], ["105vh", "-50vh"]);
  return <motion.div style={{ y, left }} className="absolute top-0 z-10 max-w-[80vw]">{children}</motion.div>;
}

function Hops({ p }: { p: P }) {
  const reduced = useReducedMotion();
  const opacity = useTransform(p, [0.04, 0.2], [0, 1]);
  return (
    <div className="m-gutter relative flex min-h-svh flex-col justify-center">
      <h2 className="m-display text-[clamp(3.5rem,11vw,12rem)]">Proof at<motion.span style={{ opacity }} className="m-serif block text-right text-muted">every hop</motion.span></h2>
      {reduced
        ? <div className="mt-10 flex flex-wrap gap-4">{DRIFT.map((c) => <div key={c.left}>{c.node}</div>)}</div>
        : DRIFT.map((c) => <Drift key={c.left} p={p} left={c.left} at={c.at}>{c.node}</Drift>)}
    </div>
  );
}

const CHECKS: { title: string; text: string; tag: ReactNode }[] = [
  { title: "Traces back to the owner", text: "Every permit links to its parent, up to the pinned root.", tag: <Chip>treasury → ops → procure → settle</Chip> },
  { title: "No permit grew", text: "Each hop must be narrower. Equal is allowed, wider is not.", tag: <Chip>500 → 100 → 25 USDC</Chip> },
  { title: "Signed by the right agent", text: "Issuer and request signatures are both checked.", tag: <Chip>EIP-712</Chip> },
  { title: "Not revoked", text: "One read covers every permit in the chain, on Ethereum.", tag: <Chip>RevocationRegistry.anyRevoked</Chip> },
  { title: "Fresh, not a replay", text: "Expiry, deadline, audience and a one-time code.", tag: <Chip>Single use</Chip> },
  { title: "Within the amount allowed", text: "Above 15 USDC, a verified human approves that exact request.", tag: <Chip>World ID step-up</Chip> },
];

function Checks() {
  return (
    <section id="checks" className="m-gutter scroll-mt-24 py-32">
      <Rise><h2 className="m-display max-w-[14ch] text-[clamp(2.5rem,6vw,6rem)]">Six checks before a cent moves</h2></Rise>
      <div className="mt-16 grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {CHECKS.map((c, i) => (
          <Rise key={c.title} i={i % 3} className="group">
            <div className="mb-5 transition-transform duration-500 ease-out group-hover:-translate-y-1">{c.tag}</div>
            <h3 className="text-2xl font-medium tracking-tight">{c.title}</h3>
            <p className="mt-2 max-w-[34ch] text-[#d8cfcc]">{c.text}</p>
          </Rise>
        ))}
      </div>
    </section>
  );
}

function Panel({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(useSpring(scrollYProgress, SPRING), [0, 1], [0.84, 1]);
  return (
    <motion.div ref={ref} style={reduced ? undefined : { scale }} className="m-panel grid gap-10 overflow-hidden p-8 md:grid-cols-2 md:items-center md:p-14">
      <div>
        <h3 className="m-display text-[clamp(2.2rem,4.4vw,4.5rem)]">{title}</h3>
        <p className="mt-5 max-w-[42ch] text-lg">{text}</p>
      </div>
      <div>
        {children}
        <p className="mt-3 text-sm text-[#f7e6e2]">Sample run from the demo fixtures.</p>
      </div>
    </motion.div>
  );
}

/** Counts up to the real figure the first time it is seen. */
function Count({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-15%" });
  const reduced = useReducedMotion();
  const v = useMotionValue(0);
  const text = useTransform(v, (n) => n.toFixed(2));
  useEffect(() => {
    if (reduced) { v.set(to); return; }
    if (!seen) return;
    const c = animate(v, to, { duration: 1.4, ease: EASE });
    return () => c.stop();
  }, [seen, reduced, to, v]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

const onView = { once: true, margin: "-15%" };

function Tripped() {
  return (
    <div data-ui className="paper paper-torn relative overflow-hidden px-6 pb-10 pt-5">
      <p className="m-serif text-2xl">Payment service receipt</p>
      <div className="mt-4 space-y-2 font-mono text-sm">
        <p className="flex justify-between gap-4 text-bad"><span>Asked</span><span className="tabular-nums"><Count to={450} /> USDC</span></p>
        <p className="flex justify-between gap-4"><span>Allowed</span><span className="tabular-nums"><Count to={100} /> USDC</span></p>
      </div>
      <div role="img" aria-label="100 USDC allowed, 350 USDC over the limit" className="mt-4 flex h-5 overflow-hidden">
        <motion.span className="w-[22.2%] origin-left bg-fg" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={onView} transition={{ duration: 0.6, ease: EASE }} />
        <motion.span className="flex-1 origin-left bg-bad" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={onView} transition={{ duration: 1, delay: 0.5, ease: EASE }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={onView} transition={{ duration: 0.7, delay: 1.1, ease: EASE }}>
        <p className="mt-5 text-2xl font-medium tracking-tight">Denied. No money moved.</p>
        <p className="mt-1 text-sm text-muted">AMPLIFICATION: the permit grew at the last hop. Balance unchanged.</p>
      </motion.div>
      <motion.span className="absolute right-5 top-3 inline-block -rotate-6 border-[3px] border-current px-2 py-0.5 text-2xl font-bold tracking-wide text-bad mix-blend-multiply" initial={{ opacity: 0, scale: 1.9 }} whileInView={{ opacity: 0.92, scale: 1 }} viewport={onView} transition={{ duration: 0.4, delay: 1.3, ease: [0.3, 1.4, 0.5, 1] }}>TRIPPED</motion.span>
    </div>
  );
}

function Revoked() {
  const rows = [["Operations agent", "Revoked"], ["Procurement agent", "Void, parent revoked"], ["Settlement agent", "Void, parent revoked"]];
  return (
    <div className="space-y-[3px]">
      {rows.map(([who, state], i) => (
        <motion.div key={who} initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={onView} transition={{ duration: 0.6, delay: 0.3 + i * 0.4, ease: EASE }} style={{ width: `${100 - i * 12}%` }}>
          <Ticket who={who} sub={state} amount={["500.00", "100.00", "25.00"][i]} tone="dead" />
        </motion.div>
      ))}
      <motion.p className="mt-3 text-2xl font-medium tracking-tight" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={onView} transition={{ duration: 0.7, delay: 1.5, ease: EASE }}>Denied. No money moved.</motion.p>
    </div>
  );
}

function Name({ p }: { p: P }) {
  const spin = useTransform(p, [0, 1], [-24, 24]);
  const scale = useTransform(p, [0, 1], [0.8, 1.15]);
  const y = useTransform(p, [0, 1], ["6vh", "-6vh"]);
  return (
    <div className="grid min-h-svh place-items-center">
      <motion.div style={{ rotate: spin, scale }} className="pointer-events-none absolute size-[min(90vw,46rem)]"><Moire className="m-spin size-full opacity-70" tone="#ff3b24" /></motion.div>
      <motion.div style={{ y }} className="relative text-center">
        <p className="m-gutter text-lg font-medium">Attenuated delegation, enforced at the door.</p>
        <h2 className="m-display mt-2 text-[clamp(4rem,17vw,17rem)]">mandate</h2>
      </motion.div>
    </div>
  );
}

function Limits() {
  return (
    <section id="limits" className="m-gutter grid scroll-mt-24 gap-12 py-32 lg:grid-cols-2">
      <Rise><h2 className="m-display text-[clamp(2.5rem,4.4vw,4rem)]">What Mandate does not promise</h2></Rise>
      <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {LIMITS.map((l, i) => <Rise key={l} i={i % 2}><li className="list-none text-[#e6dedb]">{l}</li></Rise>)}
      </ul>
    </section>
  );
}

function Close() {
  return (
    <footer className="relative overflow-hidden pt-16">
      <div className="m-gutter flex flex-wrap items-end justify-between gap-8">
        <div>
          <h2 className="m-display text-[clamp(2.5rem,6vw,6rem)]">Watch it refuse</h2>
          <p className="mt-4 max-w-[40ch] text-lg">Play the poisoned invoice and see the chain trip, or read who holds what in the registry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Link href="/" className="m-btn">Run the demo</Link>
          <Link href="/explorer" className="underline underline-offset-4 hover:text-[#ffb4a8]">Open the registry</Link>
        </div>
      </div>
      <div className="relative mt-20">
        <motion.div aria-hidden className="m-glow absolute inset-x-0 bottom-0 h-[22vw] origin-bottom" initial={{ opacity: 0, scaleY: 0.5 }} whileInView={{ opacity: 1, scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }} />
        <p aria-hidden className="m-display relative overflow-hidden pb-[calc(var(--frame)+0.5rem)] text-center text-[18.5vw] font-semibold leading-[0.9]">
          {"MANDATE".split("").map((c, i) => (
            <motion.span key={i} className="inline-block" initial={{ y: "105%" }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.05, ease: EASE }}>{c}</motion.span>
          ))}
        </p>
      </div>
    </footer>
  );
}

export function Story() {
  const reduced = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user">
    <div id="top" className="story font-sans">
      <main>
        {reduced ? (
          <>
            <Pin screens={1} rest={0}>{(p) => <Hero p={p} />}</Pin>
            <Pin screens={1}>{(p) => <Nest p={p} />}</Pin>
          </>
        ) : <Pin screens={4}>{(p) => <Opening p={p} />}</Pin>}
        <Pin screens={2.6}>{(p) => <Statement p={p} />}</Pin>
        <Pin screens={2}>{(p) => <Why p={p} />}</Pin>
        <Pin screens={3}>{(p) => <Hops p={p} />}</Pin>
        <Checks />
        <section id="how" className="m-gutter scroll-mt-24 space-y-10 py-16">
          <h2 className="sr-only">How it works</h2>
          <Panel title="A poisoned invoice" text="A hidden line told the procurement agent to grant 1,000 USDC. Its own limit was 100. The last agent asked for 450, and the breaker tripped.">
            <Tripped />
          </Panel>
          <Panel title="The owner pulls the plug" text="One revocation on Ethereum cancels the first permit. Everything below it stops working, with nothing to chase down.">
            <Revoked />
          </Panel>
        </section>
        <Pin screens={1.8}>{(p) => <Name p={p} />}</Pin>
        <Limits />
      </main>
      <Close />
    </div>
    </MotionConfig>
  );
}
