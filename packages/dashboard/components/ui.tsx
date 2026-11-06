"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** "450.00 USDC". shortcut: truncates below 1 cent; fine for whole-cent demo amounts. */
export const usdc = (v: bigint) => {
  const cents = v / 10_000n;
  return `${(cents / 100n).toLocaleString("en-US")}.${(cents % 100n).toString().padStart(2, "0")} USDC`;
};
export const short = (h: string) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);
export const time = (unix: number) => new Date(unix * 1000).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** 0x1234…abcd with a copy button. */
export function Hash({ value }: { value: string }) {
  const toast = useToast();
  return (
    <span className="whitespace-nowrap font-mono text-[0.8em]">
      <span title={value}>{short(value)}</span>
      <button
        type="button"
        className="ml-1 text-muted underline decoration-dotted hover:text-ink"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copied", "info"))}
        aria-label={`copy ${value}`}
      >
        copy
      </button>
    </span>
  );
}

const TONE = { ok: "text-ok", bad: "text-bad", warn: "text-warn", info: "text-muted" };
export type Tone = keyof typeof TONE;

/** Small status label: colour AND text, never colour alone. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block border border-current px-1.5 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-wider ${TONE[tone]}`}>{children}</span>;
}

/** Rubber stamp. `thunk` animates it landing. */
export function Stamp({ tone, children, big, thunk = true }: { tone: "ok" | "bad" | "warn"; children: ReactNode; big?: boolean; thunk?: boolean }) {
  return <span role="status" className={`stamp whitespace-nowrap ${thunk ? "stamp-thunk" : ""} ${TONE[tone]} ${big ? "text-4xl md:text-5xl" : "text-sm"}`}>{children}</span>;
}

/** Monogram badge for a person/agent: "procure.ops.treasury.dhruv.eth" → "PR". */
export function Monogram({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full border border-ink font-serif text-sm font-semibold ${dark ? "bg-ink text-sheet" : "bg-sheet"}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PresenterToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("presenter", on); }, [on]);
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-ink" />
      Presenter mode
    </label>
  );
}

// ---------- toasts ----------
type Toast = { id: number; text: string; tone: Tone };
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "info" ? 1500 : 4000);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`sheet enter border-l-4 border-l-current px-3 py-2 font-mono text-xs ${TONE[t.tone]}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal: native <dialog> gives Esc-to-close and focus trapping ----------
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="permit m-auto w-[min(92vw,30rem)] p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="p-6">
        <h2 className="mb-3 font-serif text-2xl">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Button({ tone = "plain", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "plain" | "ink" | "bad" }) {
  const c = { plain: "border-ink bg-sheet hover:bg-ink hover:text-sheet", ink: "border-ink bg-ink text-sheet hover:bg-transparent hover:text-ink", bad: "border-bad bg-bad text-sheet" }[tone];
  return <button type="button" {...p} className={`border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${c} ${p.className ?? ""}`} />;
}
