"use client";

import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import { useClient } from "@solana/react";
import { useCallback, useRef, useState } from "react";
import type { AppClient } from "@/lib/client";
import { decisionEventSchema } from "@/lib/decision-schema";
import {
  parseAutomationStance,
  stanceAllowsQuote,
  stanceLabel,
  type AutomationPhase,
  type AutomationStance,
} from "@/lib/trade-automation-public";
import { TITAN_SOL_MINT, TITAN_USDC_MINT, type TitanQuoteView } from "@/lib/titan-public";

const PRESETS = [
  { label: "SOL", mint: TITAN_SOL_MINT, decimals: 9 },
  { label: "USDC", mint: TITAN_USDC_MINT, decimals: 6 },
] as const;

/**
 * Form state for one automation run. Amounts are decimal strings.
 */
type AutomationForm = {
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  uiAmount: string;
  slippageBps: string;
  prompt: string;
  manualAddress: string;
};

const INITIAL_FORM: AutomationForm = {
  inputMint: TITAN_SOL_MINT,
  outputMint: TITAN_USDC_MINT,
  inputDecimals: 9,
  uiAmount: "0.1",
  slippageBps: "50",
  prompt:
    "Consider a mainnet swap of the stated size. Prefer standing aside when size, liquidity, or signing rules are unclear.",
  manualAddress: "",
};

/**
 * Result of one Tev1 decision collected for the automation run.
 */
type DecisionResult = {
  readonly text: string;
  readonly stance: AutomationStance;
  readonly context: string;
};

/**
 * Builds a trade-sized decision prompt from the form.
 */
function buildDecisionPrompt(form: AutomationForm): string {
  const sell = PRESETS.find((item) => item.mint === form.inputMint)?.label ?? form.inputMint;
  const buy = PRESETS.find((item) => item.mint === form.outputMint)?.label ?? form.outputMint;
  return [
    form.prompt.trim(),
    `Proposed swap: sell ${form.uiAmount.trim()} ${sell} for ${buy}.`,
    `Slippage budget: ${form.slippageBps.trim() || "50"} bps.`,
    "This is a recommendation request only. Do not treat the letter as authority to sign.",
  ].join("\n");
}

/**
 * Reads NDJSON decision events into one assistant answer.
 */
async function runDecisionStream(
  prompt: string,
  walletAddress: string | undefined,
  signal: AbortSignal,
): Promise<DecisionResult> {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", text: prompt }],
      walletAddress,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Decision request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let context = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = decisionEventSchema.safeParse(JSON.parse(trimmed) as unknown);
      if (!parsed.success) continue;
      const event = parsed.data;
      if (event.type === "context") context = event.summary;
      if (event.type === "token") text += event.text;
      if (event.type === "error") throw new Error(event.message);
    }
  }

  if (buffer.trim()) {
    const parsed = decisionEventSchema.safeParse(JSON.parse(buffer.trim()) as unknown);
    if (parsed.success) {
      if (parsed.data.type === "context") context = parsed.data.summary;
      if (parsed.data.type === "token") text += parsed.data.text;
      if (parsed.data.type === "error") throw new Error(parsed.data.message);
    }
  }

  const answer = text.trim();
  if (!answer) throw new Error("The model returned an empty decision.");
  return { text: answer, stance: parseAutomationStance(answer), context };
}

/**
 * Trade Automation desk: decision → quote → recommended route → explicit approve gate.
 * Sign/send stays stubbed until a later slice; this view never loads `id.json`.
 */
export function TradeAutomation() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [form, setForm] = useState<AutomationForm>(INITIAL_FORM);
  const [phase, setPhase] = useState<AutomationPhase>("idle");
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [quote, setQuote] = useState<TitanQuoteView | null>(null);
  const [deskAddress, setDeskAddress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const walletAddress =
    connected?.account.address ??
    (form.manualAddress.trim() || deskAddress.trim() || undefined);

  /**
   * Loads the public desk address from `/api/rpc` when no wallet is connected.
   */
  const ensureDeskAddress = useCallback(async () => {
    if (connected?.account.address || form.manualAddress.trim() || deskAddress) {
      return (
        connected?.account.address ??
        (form.manualAddress.trim() || deskAddress || undefined)
      );
    }
    const response = await fetch("/api/rpc");
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { deskWalletAddress?: string | null };
    const address = payload.deskWalletAddress?.trim() ?? "";
    if (address) setDeskAddress(address);
    return address || undefined;
  }, [connected?.account.address, deskAddress, form.manualAddress]);

  /**
   * Runs decision, optionally quotes, then waits for human approval.
   */
  async function runAutomation() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setApprovalNote(null);
    setDecision(null);
    setQuote(null);
    setPhase("deciding");

    try {
      const address = (await ensureDeskAddress()) ?? walletAddress;
      const prompt = buildDecisionPrompt(form);
      const nextDecision = await runDecisionStream(prompt, address, controller.signal);
      setDecision(nextDecision);
      setPhase("decided");

      if (!stanceAllowsQuote(nextDecision.stance)) {
        setError(
          `Stance is ${stanceLabel(nextDecision.stance)}. Quote and approval are skipped until Tev1 returns add.`,
        );
        return;
      }

      if (!address) {
        throw new Error("Connect a wallet, paste an address, or set DESK_WALLET_ADDRESS for quotes.");
      }

      setPhase("quoting");
      const response = await fetch("/api/titan/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: form.inputMint.trim(),
          outputMint: form.outputMint.trim(),
          uiAmount: form.uiAmount.trim(),
          inputDecimals: form.inputDecimals,
          userPublicKey: address,
          slippageBps: form.slippageBps.trim() ? Number(form.slippageBps) : undefined,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as TitanQuoteView | { error?: string };
      if (!response.ok || !("routes" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Quote failed.");
      }
      setQuote(payload);
      setPhase("awaiting_approval");
    } catch (caught) {
      if (controller.signal.aborted) {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Automation failed.");
    }
  }

  /**
   * Records explicit human approval. Sign/send remains disabled in this slice.
   */
  function approveExecution() {
    if (phase !== "awaiting_approval" || !quote) return;
    setPhase("approved");
    setApprovalNote(
      "Approved for a later execution slice. Sign/send is still gated: this desk does not load id.json and will not send until wallet signing is wired behind this gate.",
    );
  }

  /**
   * Rejects the proposed route and clears the approval path.
   */
  function rejectExecution() {
    if (phase !== "awaiting_approval") return;
    setPhase("rejected");
    setApprovalNote("Rejected. No transaction was built or sent.");
  }

  const busy = phase === "deciding" || phase === "quoting";
  const recommended = quote?.routes.find((route) => route.recommended) ?? quote?.routes[0] ?? null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Trade Automation
        </h1>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Decision (Tev1 + TypeDB) → mainnet Titan DART quote (public, 1 req/s; Portal optional) →
          recommended route → explicit approve before any future sign. Instruction bytes stay
          server-side. This path never loads filesystem keypairs.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runAutomation();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Sell
          <select
            value={PRESETS.some((item) => item.mint === form.inputMint) ? form.inputMint : "custom"}
            onChange={(event) => {
              if (event.target.value === "custom") return;
              const preset = PRESETS.find((item) => item.mint === event.target.value);
              if (!preset) return;
              setForm((current) => ({
                ...current,
                inputMint: preset.mint,
                inputDecimals: preset.decimals,
              }));
            }}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {PRESETS.map((item) => (
              <option key={item.mint} value={item.mint}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Buy
          <select
            value={PRESETS.some((item) => item.mint === form.outputMint) ? form.outputMint : "custom"}
            onChange={(event) => {
              if (event.target.value === "custom") return;
              setForm((current) => ({ ...current, outputMint: event.target.value }));
            }}
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          >
            {PRESETS.map((item) => (
              <option key={item.mint} value={item.mint}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

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

        <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
          Decision prompt
          <textarea
            value={form.prompt}
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
            rows={3}
            className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 py-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        {connected ? null : (
          <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
            Wallet address
            <input
              value={form.manualAddress || deskAddress}
              onChange={(event) =>
                setForm((current) => ({ ...current, manualAddress: event.target.value.trim() }))
              }
              placeholder="Connect a wallet, paste a pubkey, or rely on DESK_WALLET_ADDRESS"
              spellCheck={false}
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 font-mono text-[11px] text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-[var(--rb-r-md,8px)] bg-neutral-900 px-3 text-[13px] font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {phase === "deciding"
              ? "Deciding…"
              : phase === "quoting"
                ? "Quoting…"
                : "Run automation"}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 text-[13px] text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <p className="text-xs text-neutral-500">
        Phase: <span className="font-medium text-neutral-900 dark:text-neutral-100">{phase}</span>
      </p>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {decision ? (
        <div className="flex flex-col gap-2 rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Decision stance</p>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {stanceLabel(decision.stance)}
          </p>
          <pre className="whitespace-pre-wrap text-xs leading-5 text-neutral-600 dark:text-neutral-400">
            {decision.text}
          </pre>
          {decision.context ? (
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">TypeDB / chain context</summary>
              <pre className="mt-2 whitespace-pre-wrap leading-5">{decision.context}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {quote ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">
              Recommended route ({quote.source === "dart" ? "DART" : "Portal"})
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {quote.recommendedProvider || recommended?.provider || "Unnamed"}
            </p>
            {recommended ? (
              <p className="mt-1 text-xs text-neutral-500">
                {recommended.inDisplay} in · {recommended.outDisplay} out
                {recommended.slippageBps !== null ? ` · ${recommended.slippageBps} bps` : ""}
              </p>
            ) : null}
          </div>

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
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {phase === "awaiting_approval" ? (
        <div className="flex flex-col gap-3 rounded-[var(--rb-r-md,8px)] border border-amber-200/80 bg-amber-50/50 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs leading-5 text-neutral-700 dark:text-neutral-300">
            Human approval required. Nothing is signed or sent until you approve. Approving only unlocks
            a future execution step; sign/send is still stubbed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={approveExecution}
              className="h-9 rounded-[var(--rb-r-md,8px)] bg-neutral-900 px-3 text-[13px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Approve (gate only)
            </button>
            <button
              type="button"
              onClick={rejectExecution}
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-300 px-3 text-[13px] text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
            >
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {approvalNote ? (
        <p className="text-xs leading-5 text-neutral-600 dark:text-neutral-400">{approvalNote}</p>
      ) : null}
    </section>
  );
}
