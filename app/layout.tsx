import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TevTrade",
  description: "Local decision models for a Solana trading desk.",
};

/**
 * Root layout. Wallet and RPC providers wrap every page.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
