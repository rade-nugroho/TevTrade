"use client";

import type { ReactNode } from "react";
import { ClientProvider } from "@solana/react";
import { client } from "./client";

/**
 * App-wide Solana provider.
 *
 * `ClientProvider` is enough: Kit's `walletSigner` plugin already owns Wallet
 * Standard discovery and connect/sign. Do not wrap a second Anza
 * `WalletProvider` / `ConnectionProvider` here — that would duplicate context
 * and fight Kit signing.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
