import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Frame, Nav } from "@/components/nav";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-serif" });

export const metadata: Metadata = { title: "Mandate", description: "Agents can subcontract work. Authority must not expand." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <ToastProvider>
          <Frame />
          <Nav />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
