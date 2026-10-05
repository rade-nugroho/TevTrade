"use client";

import type { ReactNode } from "react";
import { ClientProvider } from "@solana/react";
import { client } from "./client";

export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={client}>{children}</ClientProvider>;
}
