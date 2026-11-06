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
    <span className="whitespace-nowrap font-mono text-[0.92em]">
      <span title={value}>{short(value)}</span>
      <button
        type="button"
        className="ml-1 text-muted underline decoration-dotted hover:text-fg"
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
  return <span className={`inline-flex items-baseline gap-1.5 text-xs font-medium ${TONE[tone]}`}><span aria-hidden className="size-1.5 shrink-0 translate-y-[-1px] bg-current" />{children}</span>;
}

export function PresenterToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("presenter", on); }, [on]);
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-fg" />
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
      <div className="fixed bottom-[calc(var(--frame)+1rem)] right-[calc(var(--frame)+1rem)] z-[70] flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="panel enter flex items-center gap-2 px-4 py-3 text-sm shadow-2xl"><span aria-hidden className={`size-2 bg-current ${TONE[t.tone]}`} /><span className={TONE[t.tone]}>{t.text}</span></div>
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
      className="paper m-auto w-[min(92vw,30rem)] p-0 backdrop:bg-black/70"
    >
      <div className="p-6">
        <h2 className="m-serif mb-3 text-3xl">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Button({ tone = "plain", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "plain" | "ink" | "bad" }) {
  const c = { plain: "border-transparent bg-white/8 hover:bg-white/16", ink: "border-fg bg-fg text-[#0b0909] hover:bg-[#0b0909] hover:text-fg", bad: "border-bad bg-bad text-bg" }[tone];
  return <button type="button" {...p} className={`min-h-11 border px-4 py-2 text-sm font-medium transition-[background,border-color,color,transform] duration-300 active:scale-[0.97] disabled:opacity-40 ${c} ${p.className ?? ""}`} />;
}
