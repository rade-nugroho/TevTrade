"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  buildWormholeConnectConfig,
  buildWormholeConnectTheme,
} from "@/lib/wormhole-connect";
import { DeskEmpty } from "@/components/blocks/desk-section";

/**
 * Client-only Wormhole Connect widget (browser wallets + no SSR).
 */
const WormholeConnect = dynamic(
  () => import("@wormhole-foundation/wormhole-connect"),
  {
    ssr: false,
    loading: () => (
      <DeskEmpty>Loading Wormhole Connect…</DeskEmpty>
    ),
  },
);

/**
 * Renders Wormhole Connect with TevTrade config and neutral theme.
 * Signing stays inside Connect wallet prompts — never filesystem keypairs.
 */
export function BridgeConnect() {
  const config = useMemo(() => buildWormholeConnectConfig(), []);
  const theme = useMemo(() => {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return buildWormholeConnectTheme(prefersDark ? "dark" : "light");
  }, []);

  if (!config) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-lg [&_.MuiScopedCssBaseline-root]:!bg-transparent">
      <WormholeConnect config={config} theme={theme} />
    </div>
  );
}
