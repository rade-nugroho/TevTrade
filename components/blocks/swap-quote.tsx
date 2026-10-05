"use client";

import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { useState } from "react";
import type { AppClient } from "@/lib/client";
import { TITAN_SOL_MINT, TITAN_USDC_MINT, type TitanQuoteView } from "@/lib/titan-public";

const PRESETS = [
  { label: "SOL", mint: TITAN_SOL_MINT, decimals: 9 },
  { label: "USDC", mint: TITAN_USDC_MINT, decimals: 6 },
] as const;

/**
 * Quote form state. Amounts are decimal strings, not smallest units.
 */
type QuoteForm = {
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  uiAmount: string;
  slippageBps: string;
  manualAddress: string;
};

const INITIAL_FORM: QuoteForm = {
  inputMint: TITAN_SOL_MINT,
  outputMint: TITAN_USDC_MINT,
  inputDecimals: 9,
  uiAmount: "0.1",
  slippageBps: "50",
  manualAddress: "",
};

/**
 * Selects a preset mint and its decimals.
 */
function applyMint(mint: string): { mint: string; decimals: number } {
  const preset = PRESETS.find((item) => item.mint === mint);
  return preset ? { mint: preset.mint, decimals: preset.decimals } : { mint, decimals: 9 };
}

/**
 * Mainnet DART (default) or Portal swap quote.
 * The desk displays the route and does not sign or send it.
 */
export function SwapQuote() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [form, setForm] = useState<QuoteForm>(INITIAL_FORM);
  const [quote, setQuote] = useState<TitanQuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const walletAddress = connected?.account.address ?? form.manualAddress.trim();

  /**
   * Requests a quote through the server proxy.
   */
  async function requestQuote() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/titan/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: form.inputMint.trim(),
          outputMint: form.outputMint.trim(),
          uiAmount: form.uiAmount.trim(),
          inputDecimals: form.inputDecimals,
          userPublicKey: walletAddress,
          slippageBps: form.slippageBps.trim() ? Number(form.slippageBps) : undefined,
        }),
      });
      const payload = (await response.json()) as TitanQuoteView | { error?: string };
      if (!response.ok || !("routes" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Quote failed.");
      }
      setQuote(payload);
    } catch (caught) {
      setQuote(null);
      setError(caught instanceof Error ? caught.message : "Quote failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Quote</h1>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Mainnet Titan DART quote by default (public endpoint, 1 req/s). Portal is optional via{" "}
          <code className="font-mono text-[11px]">TITAN_QUOTE_SOURCE=portal</code>. This desk does not sign or
          send the swap.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void requestQuote();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Sell
          <select
            value={PRESETS.some((item) => item.mint === form.inputMint) ? form.inputMint : "custom"}
            onChange={(event) => {
              if (event.target.value === "custom") return;
              const next = applyMint(event.target.value);
              setForm((current) => ({ ...current, inputMint: next.mint, inputDecimals: next.decimals }));
            }}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {PRESETS.map((item) => (
              <option key={item.mint} value={item.mint}>
                {item.label}
              </option>
            ))}
            <option value="custom">Custom mint</option>
          </select>
          <input
            value={form.inputMint}
            onChange={(event) => {
              const mint = event.target.value.trim();
              const preset = PRESETS.find((item) => item.mint === mint);
              setForm((current) => ({
                ...current,
                inputMint: mint,
                inputDecimals: preset?.decimals ?? current.inputDecimals,
              }));
            }}
            spellCheck={false}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 font-mono text-[11px] text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Buy
          <select
            value={PRESETS.some((item) => item.mint === form.outputMint) ? form.outputMint : "custom"}
            onChange={(event) => {
              if (event.target.value === "custom") return;
              setForm((current) => ({ ...current, outputMint: applyMint(event.target.value).mint }));
            }}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {PRESETS.map((item) => (
              <option key={item.mint} value={item.mint}>
                {item.label}
              </option>
            ))}
            <option value="custom">Custom mint</option>
          </select>
          <input
            value={form.outputMint}
            onChange={(event) => setForm((current) => ({ ...current, outputMint: event.target.value.trim() }))}
            spellCheck={false}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 font-mono text-[11px] text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        {PRESETS.some((item) => item.mint === form.inputMint) ? null : (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Sell decimals
            <input
              value={form.inputDecimals}
              onChange={(event) =>
                setForm((current) => ({ ...current, inputDecimals: Number(event.target.value) }))
              }
              inputMode="numeric"
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        )}

        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Amount
          <input
            value={form.uiAmount}
            onChange={(event) => setForm((current) => ({ ...current, uiAmount: event.target.value }))}
            inputMode="decimal"
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Slippage, bps
          <input
            value={form.slippageBps}
            onChange={(event) => setForm((current) => ({ ...current, slippageBps: event.target.value }))}
            inputMode="numeric"
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        {connected ? null : (
          <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
            Wallet address
            <input
              value={form.manualAddress}
              onChange={(event) => setForm((current) => ({ ...current, manualAddress: event.target.value.trim() }))}
              placeholder="Connect a wallet, or paste the address Titan should quote for"
              spellCheck={false}
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 font-mono text-[11px] text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || !walletAddress}
            className="h-9 rounded-[var(--rb-r-md,8px)] bg-neutral-900 px-3 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {pending ? "Requesting quote…" : "Get quote"}
          </button>
        </div>
      </form>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {quote ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-neutral-500">
            {quote.source === "dart" ? "DART" : "Portal"}
            {quote.recommendedProvider ? (
              <>
                {" "}
                · recommended{" "}
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{quote.recommendedProvider}</span>
              </>
            ) : (
              " · Titan did not name a recommended provider."
            )}
            {quote.inputPriceUsd !== null && quote.outputPriceUsd !== null
              ? ` · $${quote.inputPriceUsd.toFixed(4)} to $${quote.outputPriceUsd.toFixed(4)}`
              : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {quote.routes.map((route) => (
              <li
                key={route.provider}
                className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <p className="text-sm text-neutral-900 dark:text-neutral-100">
                  {route.recommended ? "Recommended · " : ""}
                  {route.provider}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {route.inDisplay} in · {route.outDisplay} out
                  {route.slippageBps !== null ? ` · ${route.slippageBps} bps` : ""}
                </p>
                {route.steps.length > 0 ? (
                  <ol className="mt-2 flex flex-col gap-1">
                    {route.steps.map((step, index) => (
                      <li key={`${route.provider}-${index}`} className="text-xs text-neutral-500">
                        {step.label}
                        {step.inDisplay && step.outDisplay ? ` · ${step.inDisplay} → ${step.outDisplay}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
