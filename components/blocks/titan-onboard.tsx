"use client";

import { useEffect, useState } from "react";
import {
  useConnectedWallet,
  useSignMessage,
} from "@solana/kit-plugin-wallet/react";
import { getBase58Decoder } from "@solana/kit";
import { useClient } from "@solana/react";
import type { AppClient } from "@/lib/client";
import {
  buildSiwsMessage,
  readTitanSession,
  titanSubFromWallet,
  writeTitanSession,
  type TitanOnboardResult,
  type TitanSession,
} from "@/lib/titan-dca-public";

/**
 * SIWS onboard control for the connected wallet.
 * `sub` is the wallet pubkey because TevTrade has no separate auth user.
 */
export function TitanOnboardButton({
  onSession,
}: {
  readonly onSession?: (session: TitanSession | null) => void;
}) {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const signMessage = useSignMessage(client);
  const [session, setSession] = useState<TitanSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userPubkey = connected?.account.address;

  useEffect(() => {
    if (!userPubkey) {
      setSession(null);
      onSession?.(null);
      return;
    }
    const stored = readTitanSession(titanSubFromWallet(userPubkey));
    setSession(stored);
    onSession?.(stored);
  }, [userPubkey, onSession]);

  if (!userPubkey) {
    return <p className="text-xs text-neutral-500">Connect a wallet to link Titan DCA.</p>;
  }

  /**
   * Builds the canonical SIWS message, signs it, and posts to the server proxy.
   */
  async function runOnboard() {
    if (!userPubkey) return;
    setPending(true);
    setError(null);
    try {
      const sub = titanSubFromWallet(userPubkey);
      const message = buildSiwsMessage(userPubkey, sub);
      const signatureBytes = await signMessage.dispatchAsync(new TextEncoder().encode(message));
      const signature = getBase58Decoder().decode(signatureBytes);

      const response = await fetch("/api/titan/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sub,
          userPubkey,
          message,
          signature,
        }),
      });
      const payload = (await response.json()) as TitanOnboardResult | { error?: string; code?: string };
      if (!response.ok || !("userId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
            : "Onboard failed.",
        );
      }

      writeTitanSession(payload);
      setSession(payload);
      onSession?.(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Onboard failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1 text-right">
      {session ? (
        <p className="max-w-[14rem] truncate font-mono text-[11px] text-neutral-500" title={session.walletAddress}>
          Titan mgr {session.walletAddress.slice(0, 4)}…{session.walletAddress.slice(-4)}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending || signMessage.isRunning}
        onClick={() => void runOnboard()}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
      >
        {pending || signMessage.isRunning ? "Signing…" : session ? "Re-link Titan" : "Link Titan"}
      </button>
      {error ? <p className="max-w-[16rem] text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
