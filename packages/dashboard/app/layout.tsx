import type { Metadata } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { PresenterToggle, ToastProvider } from "@/components/ui";
import { MOCK } from "@/lib/api";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = { title: "Mandate", description: "Agents can subcontract work. Authority must not expand." };

// SPEC §12 limitations and non-goals
const LIMITS = [
  "Each limit is per request; there are no running budgets.",
  "A stolen owner key is not protected against.",
  "Harmful actions inside the granted limits are still allowed.",
  "A completed payment cannot be undone.",
  "Services that skip the check are not protected.",
  "Revocation is only as fresh as the last registry read.",
  "Replay protection lives in memory and resets on restart.",
  "The payment adapter is run by the backend.",
  "The LLM agent shows the threat; it is not part of the guarantee.",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <ToastProvider>
          <header className="border-b-2 border-double border-ink">
            <div className="mx-auto flex max-w-[1800px] flex-wrap items-end gap-x-8 gap-y-2 px-4 py-4 md:px-8">
              <Link href="/" className="font-serif text-3xl font-semibold tracking-[0.18em]">MANDATE</Link>
              <span className="pb-1 font-serif text-base italic text-muted">Agents can subcontract work. Authority must not expand.</span>
              <nav className="ml-auto flex flex-wrap items-center gap-5 pb-1 text-sm">
                <Link href="/" className="underline-offset-4 hover:underline">Stage</Link>
                <Link href="/explorer" className="underline-offset-4 hover:underline">Registry</Link>
                <details className="relative">
                  <summary className="cursor-pointer underline-offset-4 hover:underline">Trust limits</summary>
                  <div className="permit absolute right-0 z-50 mt-3 w-80 p-4 text-xs">
                    <p className="mb-2 font-serif text-base">What Mandate does not promise</p>
                    <ul className="list-disc space-y-1 pl-4">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
                  </div>
                </details>
                <PresenterToggle />
                {MOCK && (
                  <span className="border-2 border-warn px-1.5 py-0.5 font-mono text-xs font-bold text-warn" title="NEXT_PUBLIC_SERVICE_URL is not set: these are fixtures, not live results">
                    MOCK DATA
                  </span>
                )}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-[1800px] px-4 py-6 md:px-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
