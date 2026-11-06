import type { Metadata } from "next";
import Link from "next/link";
import { ToastProvider } from "@/components/ui";
import { MOCK } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = { title: "Mandate", description: "Agents can subcontract work. Authority must not expand." };

// SPEC §12 limitations and non-goals
const LIMITS = [
  "maxAmount is a per-execution ceiling; no aggregate budgets.",
  "No protection against a compromised root key.",
  "Harmful actions inside granted scope are still allowed.",
  "Completed transactions cannot be undone.",
  "Services that skip enforcement are not protected.",
  "Revocation is only as fresh as the last registry read.",
  "Replay protection is in-memory and lost on service restart.",
  "The payment adapter is backend-controlled.",
  "The LLM agent shows a threat; it is not part of the security property.",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <ToastProvider>
          <nav className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold tracking-tight">Mandate</Link>
              <span className="hidden text-sm text-muted md:inline">Agents can subcontract work. Authority must not expand.</span>
              <div className="ml-auto flex items-center gap-4 text-sm">
                <Link href="/" className="hover:underline">Chain view</Link>
                <Link href="/explorer" className="hover:underline">Explorer</Link>
                <details className="relative">
                  <summary className="cursor-pointer hover:underline">Trust limits</summary>
                  <ul className="absolute right-0 z-50 mt-2 w-80 list-disc space-y-1 rounded border border-line bg-white p-4 pl-8 text-xs shadow">
                    {LIMITS.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </details>
                {MOCK && (
                  <span className="rounded border border-warn px-1.5 py-0.5 text-xs font-bold text-warn" title="NEXT_PUBLIC_SERVICE_URL is not set: showing fixtures, not live results">
                    MOCK DATA
                  </span>
                )}
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
