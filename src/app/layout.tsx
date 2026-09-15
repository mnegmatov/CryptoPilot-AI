import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryptoPilot AI — Institutional Crypto Market Analyst & Signal Platform",
  description:
    "Production-quality crypto trading intelligence with deterministic quant indicators, multi-timeframe confluence, risk guardrails, backtesting, and paper trading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080B10] text-[#E2E8F0] antialiased selection:bg-sky-500/20 selection:text-sky-300">
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "#141A29",
              border: "1px solid #1E2638",
              color: "#E2E8F0",
            },
          }}
        />
      </body>
    </html>
  );
}
