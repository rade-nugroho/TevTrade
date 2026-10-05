"use client";

import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { useState } from "react";
import type { AppClient } from "@/lib/client";
import { TITAN_SOL_MINT, TITAN_USDC_MINT } from "@/lib/titan-public";

/**
 * One-shot Direct price response.
 */
type DirectPrice = {
  readonly id: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountIn: string;
  readonly amountOut: string;
};

/**
 * Stream quote update from the NDJSON proxy.
 */
type DirectStreamUpdate = {
  readonly type: "quote";
  readonly id: string;
  readonly expectedWinner: string | null;
  readonly winnerOutAmount: string | null;
  readonly routes: readonly {
    readonly provider: string;
    readonly inAmount: string;
    readonly outAmount: string;
    readonly slippageBps: number | null;
  }[];
};

/**
 * Titan Direct one-shot price and short NDJSON stream. Quotes only — no swap execution.
 */
export function TitanDirectQuote() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [inputMint, setInputMint] = useState(TITAN_SOL_MINT);
  const [outputMint, setOutputMint] = useState(TITAN_USDC_MINT);
  const [inputDecimals, setInputDecimals] = useState(9);
  const [uiAmount, setUiAmount] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState("50");
  const [manualAddress, setManualAddress] = useState("");
  const [price, setPrice] = useState<DirectPrice | null>(null);
  const [streamLines, setStreamLines] = useState<DirectStreamUpdate[]>([]);
  const [pending, setPending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = connected?.account.address ?? manualAddress.trim();

  /**
   * Requests a one-shot Direct price through the server proxy.
   */
  async function requestPrice() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/titan/direct/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: inputMint.trim(),
          outputMint: outputMint.trim(),
          uiAmount: uiAmount.trim(),
          inputDecimals,
          userPublicKey: walletAddress || undefined,
          slippageBps: slippageBps.trim() ? Number(slippageBps) : undefined,
        }),
      });
      const payload = (await response.json()) as DirectPrice | { error?: string; code?: string };
      if (!response.ok || !("amountOut" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
            : "Direct price failed.",
        );
      }
      setPrice(payload);
    } catch (caught) {
      setPrice(null);
      setError(caught instanceof Error ? caught.message : "Direct price failed.");
    } finally {
      setPending(false);
    }
  }

  /**
   * Opens a capped NDJSON quote stream through the server proxy.
   */
  async function requestStream() {
    if (!walletAddress) {
      setError("Connect a wallet or paste a user public key for the stream.");
      return;
    }
    setStreaming(true);
    setError(null);
    setStreamLines([]);
    try {
      const response = await fetch("/api/titan/direct/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: inputMint.trim(),
          outputMint: outputMint.trim(),
          uiAmount: uiAmount.trim(),
          inputDecimals,
          userPublicKey: walletAddress,
          slippageBps: slippageBps.trim() ? Number(slippageBps) : undefined,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json()) as { error?: string; code?: string };
        throw new Error(
          payload.error ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}` : "Direct stream failed.",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (!line.trim()) continue;
          const row = JSON.parse(line) as
            | DirectStreamUpdate
            | { type: "error"; error?: string; code?: string }
            | { type: "end" };
          if (row.type === "error") {
            throw new Error(row.error ? `${row.code ? `${row.code}: ` : ""}${row.error}` : "Stream error.");
          }
          if (row.type === "quote") {
            setStreamLines((prev) => [...prev.slice(-19), row]);
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Direct stream failed.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 border-t border-neutral-200 p-4 dark:border-neutral-800 sm:p-6">
      <div>
        <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Direct stream</h2>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Server-side Titan Direct SDK (`V1Client`). JWT never reaches the browser. Quotes only — no swap send.
          Needs TITAN_ENDPOINT and TITAN_JWT.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void requestPrice();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Input mint
          <input
            value={inputMint}
            onChange={(event) => setInputMint(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Output mint
          <input
            value={outputMint}
            onChange={(event) => setOutputMint(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Amount
          <input
            value={uiAmount}
            onChange={(event) => setUiAmount(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Input decimals
          <input
            type="number"
            min={0}
            max={18}
            value={inputDecimals}
            onChange={(event) => setInputDecimals(Number(event.target.value))}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Slippage bps
          <input
            value={slippageBps}
            onChange={(event) => setSlippageBps(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          User pubkey (stream)
          <input
            value={connected?.account.address ?? manualAddress}
            onChange={(event) => setManualAddress(event.target.value)}
            disabled={Boolean(connected?.account.address)}
            placeholder="Connect a wallet or paste an address"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-sm disabled:opacity-70 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending || streaming}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Pricing…" : "One-shot price"}
          </button>
          <button
            type="button"
            disabled={pending || streaming}
            onClick={() => void requestStream()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            {streaming ? "Streaming…" : "Stream ~30s"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {price ? (
        <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
          price {price.id}: {price.amountIn} → {price.amountOut}
        </p>
      ) : null}

      {streamLines.length > 0 ? (
        <ul className="flex flex-col gap-2 font-mono text-xs text-neutral-600 dark:text-neutral-400">
          {streamLines.map((line) => (
            <li key={`${line.id}-${line.expectedWinner}-${line.winnerOutAmount}`}>
              {line.expectedWinner ?? "—"} out {line.winnerOutAmount ?? "—"} · {line.routes.length} routes
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
