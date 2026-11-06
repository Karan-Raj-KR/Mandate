"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";

export const usdc = (v: bigint) => `${formatUnits(v, 6)} USDC`;
export const short = (h: string) => (h.length > 14 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h);
export const time = (unix: number) => new Date(unix * 1000).toLocaleString();

/** 0x1234…abcd with a copy button. */
export function Hash({ value }: { value: string }) {
  const toast = useToast();
  return (
    <span className="font-mono text-xs">
      <span title={value}>{short(value)}</span>
      <button
        type="button"
        className="ml-1 text-muted hover:text-ink underline"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast("Copied", "info"))}
        aria-label={`copy ${value}`}
      >
        copy
      </button>
    </span>
  );
}

const TONE = { ok: "border-ok text-ok", bad: "border-bad text-bad", warn: "border-warn text-warn", info: "border-line text-muted" };
export type Tone = keyof typeof TONE;

/** Status is always colour AND text. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-semibold tracking-wide ${TONE[tone]}`}>{children}</span>;
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
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "info" ? 1500 : 5000);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded border-l-4 bg-white px-3 py-2 text-sm shadow ${TONE[t.tone]}`}>
            {t.text}
          </div>
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
      className="m-auto w-[min(92vw,28rem)] rounded border border-line bg-paper p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="p-5">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Button({ tone = "plain", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "plain" | "accent" | "bad" }) {
  const c = { plain: "border-line bg-white hover:border-ink", accent: "border-accent bg-accent text-white", bad: "border-bad bg-bad text-white" }[tone];
  return <button type="button" {...p} className={`rounded border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${c} ${p.className ?? ""}`} />;
}
