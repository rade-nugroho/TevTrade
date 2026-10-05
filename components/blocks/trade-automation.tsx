"use client";

import { useConnectedWallet } from "@solana/kit-plugin-wallet/react";
import {
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
} from "@solana/kit";
import { useClient } from "@solana/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { AppClient } from "@/lib/client";
import { executeDartSwap } from "@/lib/dart-execution";
import { decisionEventSchema } from "@/lib/decision-schema";
import {
  canSendDartSwap,
  clusterAllowsDartSend,
  dartSendBlockedMessage,
  SOLANA_CHAIN,
  solanaClusterLabel,
} from "@/lib/solana-cluster";
import {
  buildOrderIdempotencyKey,
  confirmResultOrder,
  formatAtomAmount,
  titanSubFromWallet,
  type TitanOrder,
  type TitanOrderConfirmResult,
  type TitanOrderIntentResult,
  type TitanOrderType,
} from "@/lib/titan-dca-public";
import { TITAN_SOL_MINT, TITAN_USDC_MINT, type TitanQuoteView } from "@/lib/titan-public";
import {
  automationSupportsOrderType,
  buildAutomationOrderConfig,
  parseAutomationStance,
  stanceAllowsQuote,
  stanceLabel,
  trackLabel,
  type AutomationPhase,
  type AutomationPriceBasis,
  type AutomationStance,
  type AutomationTrack,
} from "@/lib/trade-automation-public";

const PRESETS = [
  { label: "SOL", mint: TITAN_SOL_MINT, decimals: 9 },
  { label: "USDC", mint: TITAN_USDC_MINT, decimals: 6 },
] as const;

const ORDER_TYPES: readonly TitanOrderType[] = [
  "dca",
  "stop_loss",
  "take_profit",
  "oco",
  "slice",
];

/**
 * Form state for one automation run.
 */
type AutomationForm = {
  track: AutomationTrack;
  orderType: TitanOrderType;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  uiAmount: string;
  amountPerCycleUi: string;
  cycleFrequencySeconds: string;
  totalCycles: string;
  slippageBps: string;
  triggerPriceUi: string;
  priceDecimals: string;
  priceBasis: AutomationPriceBasis;
  minOutputUi: string;
  trailingStopBps: string;
  /** When true, operator explicitly targets mainnet for DART send on a non-mainnet desk. */
  targetQuoteChain: boolean;
  prompt: string;
  manualAddress: string;
};

const INITIAL_FORM: AutomationForm = {
  track: "spot",
  orderType: "dca",
  inputMint: TITAN_SOL_MINT,
  outputMint: TITAN_USDC_MINT,
  inputDecimals: 9,
  outputDecimals: 6,
  uiAmount: "0.1",
  amountPerCycleUi: "0.01",
  cycleFrequencySeconds: "86400",
  totalCycles: "10",
  slippageBps: "50",
  triggerPriceUi: "100",
  priceDecimals: "6",
  priceBasis: "pair",
  minOutputUi: "",
  trailingStopBps: "",
  targetQuoteChain: false,
  prompt:
    "Consider the stated size. Prefer standing aside when size, liquidity, or signing rules are unclear.",
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
  const trackLine =
    form.track === "spot"
      ? `Proposed spot swap: sell ${form.uiAmount.trim()} ${sell} for ${buy}.`
      : `Proposed ${form.orderType} automation: deposit ${form.uiAmount.trim()} ${sell} toward ${buy}.`;
  const detailLine =
    form.track === "spot"
      ? `Slippage budget: ${form.slippageBps.trim() || "50"} bps.`
      : form.orderType === "dca"
        ? `Cycles: ${form.totalCycles} × ${form.amountPerCycleUi} every ${form.cycleFrequencySeconds}s.`
        : `Trigger ${form.triggerPriceUi} (${form.priceBasis}, ${form.priceDecimals} decimals).`;
  return [
    form.prompt.trim(),
    trackLine,
    detailLine,
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
 * Trade Automation desk.
 * Spot: decision → DART/Portal quote → approve → Wallet Standard sign + send.
 * Order: decision → intent preview → approve → Wallet Standard sign → confirm.
 * Never loads `id.json`.
 */
export function TradeAutomation() {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const [form, setForm] = useState<AutomationForm>(INITIAL_FORM);
  const [phase, setPhase] = useState<AutomationPhase>("idle");
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [quote, setQuote] = useState<TitanQuoteView | null>(null);
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [intent, setIntent] = useState<TitanOrderIntentResult | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<TitanOrder | null>(null);
  const [confirmMeta, setConfirmMeta] = useState<TitanOrderConfirmResult | null>(null);
  const [deskAddress, setDeskAddress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [approvalNote, setApprovalNote] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
  const abortRef = useRef<AbortController | null>(null);

  const walletAddress =
    connected?.account.address ??
    (form.manualAddress.trim() || deskAddress.trim() || undefined);
  const sub = walletAddress ? titanSubFromWallet(walletAddress) : null;
  const idempotencyKey = useMemo(
    () => buildOrderIdempotencyKey(form.orderType, attemptId),
    [form.orderType, attemptId],
  );

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
   * Signs the base64 deposit transaction with the connected Wallet Standard signer.
   */
  async function signDepositTransaction(base64Tx: string): Promise<string> {
    const signer = connected?.signer;
    if (!signer || !("modifyAndSignTransactions" in signer)) {
      throw new Error("Connect a Wallet Standard wallet that can sign versioned transactions.");
    }
    const txBytes = getBase64Encoder().encode(base64Tx);
    const transaction = getTransactionDecoder().decode(txBytes);
    const [signed] = await signer.modifyAndSignTransactions([transaction]);
    return getBase64Decoder().decode(getTransactionEncoder().encode(signed));
  }

  /**
   * Requests a Special Orders intent (dca / stop_loss / take_profit happy path).
   */
  async function requestIntent(address: string, signal: AbortSignal): Promise<TitanOrderIntentResult> {
    if (!automationSupportsOrderType(form.orderType)) {
      throw new Error(
        `Automation happy-path does not build ${form.orderType} config yet. Use Orders for raw JSON, or pick dca / stop_loss / take_profit.`,
      );
    }
    const config = buildAutomationOrderConfig(form.orderType, form);
    if (!config) {
      throw new Error(
        form.orderType === "dca"
          ? "Check deposit amount, amount per cycle, frequency (≥60s), and cycle count."
          : "Check deposit amount, trigger price, price decimals (0–18), and optional min-output / trailing bps.",
      );
    }
    if (!sub) throw new Error("Connect a wallet to create a Special Order intent.");

    const response = await fetch("/api/titan/orders/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sub,
        orderType: form.orderType,
        userPubkey: address,
        config,
        onboardIfNeeded: true,
        outputRecipientAddress: address,
        idempotencyKey,
      }),
      signal,
    });
    const payload = (await response.json()) as TitanOrderIntentResult | { error?: string; code?: string };
    if (!response.ok || !("pendingOrderId" in payload)) {
      throw new Error(
        "error" in payload && payload.error
          ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
          : "Intent failed. Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY.",
      );
    }
    return payload;
  }

  /**
   * Runs decision, then either quotes (spot) or creates an intent (order).
   */
  async function runAutomation() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setApprovalNote(null);
    setDecision(null);
    setQuote(null);
    setQuotedFor(null);
    setIntent(null);
    setConfirmedOrder(null);
    setConfirmMeta(null);
    setPhase("deciding");

    try {
      const address = (await ensureDeskAddress()) ?? walletAddress;
      const nextDecision = await runDecisionStream(
        buildDecisionPrompt(form),
        address,
        controller.signal,
      );
      setDecision(nextDecision);
      setPhase("decided");

      if (!stanceAllowsQuote(nextDecision.stance)) {
        setError(
          `Stance is ${stanceLabel(nextDecision.stance)}. Quote / intent skipped until Tev1 returns add.`,
        );
        return;
      }
      if (!address) {
        throw new Error("Connect a wallet, paste an address, or set DESK_WALLET_ADDRESS.");
      }

      if (form.track === "spot") {
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
            includeInstructions: true,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as TitanQuoteView | { error?: string };
        if (!response.ok || !("routes" in payload)) {
          throw new Error("error" in payload && payload.error ? payload.error : "Quote failed.");
        }
        setQuote(payload);
        setQuotedFor(address);
        setPhase("awaiting_approval");
        return;
      }

      setPhase("intenting");
      const nextIntent = await requestIntent(address, controller.signal);
      setIntent(nextIntent);
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
   * Spot track: Wallet Standard signs + sends the quoted DART route.
   * Order track: Wallet Standard signs deposit, then confirm.
   * Declining the wallet prompt returns the run to awaiting_approval.
   * Never loads `id.json`. DART send is refused off-mainnet unless the operator
   * explicitly targets the quote chain.
   */
  async function approveExecution() {
    if (phase !== "awaiting_approval") return;

    if (form.track === "spot") {
      if (!quote) return;
      const signer = connected?.signer ?? null;

      if (!quote.execution) {
        setPhase("approved");
        setApprovalNote(
          "Approved. This route carries no executable instructions (Portal quotes are display-only), so nothing was signed or sent.",
        );
        return;
      }
      if (
        !canSendDartSwap({
          chain: SOLANA_CHAIN,
          targetQuoteChain: form.targetQuoteChain,
        })
      ) {
        setPhase("awaiting_approval");
        setApprovalNote(dartSendBlockedMessage(SOLANA_CHAIN));
        return;
      }
      if (!signer || !connected) {
        setPhase("approved");
        setApprovalNote(
          "Approved. No Wallet Standard signer is connected, so nothing was signed or sent. Connect a wallet and re-run to execute.",
        );
        return;
      }
      if (quotedFor && quotedFor !== connected.account.address) {
        setPhase("approved");
        setApprovalNote(
          "Approved, but the connected wallet is not the address this route was quoted for. Re-run with the quoting wallet to execute.",
        );
        return;
      }
      if (!connected.supportedTransactionVersions.has(0)) {
        setPhase("approved");
        setApprovalNote(
          "Approved, but the connected wallet cannot sign V0 transactions. Nothing was signed or sent.",
        );
        return;
      }

      setPhase("executing");
      setApprovalNote(
        clusterAllowsDartSend(SOLANA_CHAIN)
          ? "Approved. Building the V0 transaction — your wallet will ask to sign and send on mainnet."
          : "Approved with explicit mainnet quote-chain targeting. Building the V0 transaction — your wallet will ask to sign and send.",
      );
      try {
        const signature = await executeDartSwap(client, signer, quote.execution);
        setPhase("executed");
        setApprovalNote(`Executed. Signature: ${signature}`);
      } catch (caught) {
        setPhase("awaiting_approval");
        setApprovalNote(
          `Execution failed: ${caught instanceof Error ? caught.message : "unknown error"}. Approve again to retry, or Reject to abandon this route.`,
        );
      }
      return;
    }

    if (!intent || !sub) return;
    const expiresAt = Date.parse(intent.expiresAt);
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
      setError("Intent expired. Run automation again for a fresh deposit tx.");
      setIntent(null);
      setAttemptId(crypto.randomUUID());
      setPhase("error");
      return;
    }

    setPhase("signing");
    setError(null);
    try {
      const signedTransaction = await signDepositTransaction(intent.transaction);
      setPhase("confirming");
      const response = await fetch("/api/titan/orders/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sub,
          pendingOrderId: intent.pendingOrderId,
          signedTransaction,
          idempotencyKey,
        }),
      });
      const payload = (await response.json()) as TitanOrderConfirmResult | { error?: string; code?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? `${payload.code ? `${payload.code}: ` : ""}${payload.error}`
            : "Confirm failed.",
        );
      }
      const typed = confirmResultOrder(payload as TitanOrderConfirmResult);
      setConfirmMeta(payload as TitanOrderConfirmResult);
      setConfirmedOrder(typed);
      setPhase("confirmed");
      setApprovalNote("Deposit signed with Wallet Standard and confirmed. No filesystem keypair was used.");
      setAttemptId(crypto.randomUUID());
    } catch (caught) {
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Sign/confirm failed.");
    }
  }

  function rejectExecution() {
    if (phase !== "awaiting_approval") return;
    setPhase("rejected");
    setApprovalNote("Rejected. No transaction was signed or sent.");
  }

  const busy =
    phase === "deciding" ||
    phase === "quoting" ||
    phase === "intenting" ||
    phase === "signing" ||
    phase === "executing" ||
    phase === "confirming";
  const recommended = quote?.routes.find((route) => route.recommended) ?? quote?.routes[0] ?? null;
  const inputDecimals = form.inputDecimals;
  const intentAmount =
    intent?.inputAmount !== undefined
      ? typeof intent.inputAmount === "number"
        ? String(intent.inputAmount)
        : intent.inputAmount
      : null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Trade Automation
        </h1>
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Decision (Tev1 + TypeDB) → {trackLabel(form.track)} → explicit approve before any sign.
          Spot uses DART/Portal quotes. Orders use Special Order Types intent → confirm. Never{" "}
          <span className="font-mono">id.json</span>.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runAutomation();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
          Track
          <select
            value={form.track}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                track: event.target.value as AutomationTrack,
              }))
            }
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          >
            <option value="spot">Spot quote (DART / Portal)</option>
            <option value="order">Scheduled order (Special Types)</option>
          </select>
        </label>

        {form.track === "order" ? (
          <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">
            Order type
            <select
              value={form.orderType}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  orderType: event.target.value as TitanOrderType,
                }));
                setAttemptId(crypto.randomUUID());
              }}
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            >
              {ORDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
              const preset = PRESETS.find((item) => item.mint === event.target.value);
              if (!preset) return;
              setForm((current) => ({
                ...current,
                outputMint: preset.mint,
                outputDecimals: preset.decimals,
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
          {form.track === "order" ? "Deposit amount" : "Amount"}
          <input
            value={form.uiAmount}
            onChange={(event) => setForm((current) => ({ ...current, uiAmount: event.target.value }))}
            inputMode="decimal"
            className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>

        {form.track === "spot" ? (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Slippage, bps
            <input
              value={form.slippageBps}
              onChange={(event) => setForm((current) => ({ ...current, slippageBps: event.target.value }))}
              inputMode="numeric"
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        ) : form.orderType === "dca" ? (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Amount per cycle
            <input
              value={form.amountPerCycleUi}
              onChange={(event) =>
                setForm((current) => ({ ...current, amountPerCycleUi: event.target.value }))
              }
              inputMode="decimal"
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-neutral-500">
            Trigger price
            <input
              value={form.triggerPriceUi}
              onChange={(event) =>
                setForm((current) => ({ ...current, triggerPriceUi: event.target.value }))
              }
              inputMode="decimal"
              placeholder="e.g. 100 or 0.45"
              className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
            />
          </label>
        )}

        {form.track === "order" && form.orderType === "dca" ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Cycle frequency (seconds)
              <input
                value={form.cycleFrequencySeconds}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cycleFrequencySeconds: event.target.value }))
                }
                inputMode="numeric"
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Total cycles
              <input
                value={form.totalCycles}
                onChange={(event) =>
                  setForm((current) => ({ ...current, totalCycles: event.target.value }))
                }
                inputMode="numeric"
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
          </>
        ) : null}

        {form.track === "order" &&
        (form.orderType === "stop_loss" || form.orderType === "take_profit") ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Price decimals
              <input
                value={form.priceDecimals}
                onChange={(event) =>
                  setForm((current) => ({ ...current, priceDecimals: event.target.value }))
                }
                inputMode="numeric"
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Price basis
              <select
                value={form.priceBasis}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priceBasis: event.target.value as AutomationPriceBasis,
                  }))
                }
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              >
                <option value="pair">pair (out per in)</option>
                <option value="usd">usd (USD per input)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Min output (optional)
              <input
                value={form.minOutputUi}
                onChange={(event) =>
                  setForm((current) => ({ ...current, minOutputUi: event.target.value }))
                }
                inputMode="decimal"
                placeholder="Output mint amount floor"
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-500">
              Trailing stop bps (optional)
              <input
                value={form.trailingStopBps}
                onChange={(event) =>
                  setForm((current) => ({ ...current, trailingStopBps: event.target.value }))
                }
                inputMode="numeric"
                placeholder="1–9999"
                className="h-9 rounded-[var(--rb-r-md,8px)] border border-neutral-200 bg-white px-2 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
          </>
        ) : null}

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
              placeholder="Connect a wallet for order sign, or paste a pubkey for quotes"
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
                : phase === "intenting"
                  ? "Creating intent…"
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
        {form.track === "order" ? (
          <>
            {" "}
            · idempotency <span className="font-mono">{idempotencyKey}</span>
          </>
        ) : null}
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
        </div>
      ) : null}

      {quote ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">
              {quote.source === "dart" ? "DART" : "Portal"}
              {quote.recommendedProvider ? (
                <>
                  {" "}
                  · expectedWinner / recommended{" "}
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {quote.recommendedProvider}
                  </span>
                </>
              ) : (
                " · Titan did not name a recommended provider."
              )}
              {quote.execution
                ? ` · ${quote.execution.instructions.length} ix · ${quote.execution.addressLookupTables.length} ALT`
                : " · no executable instructions on this quote"}
            </p>
            {recommended ? (
              <p className="mt-1 text-xs text-neutral-500">
                Top route: {recommended.inDisplay} in · {recommended.outDisplay} out
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
                  {route.slippageBps !== null ? ` · ${route.slippageBps} bps` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intent ? (
        <div className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Intent preview (unsigned deposit)</p>
          <dl className="mt-2 grid gap-1 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
            <div>pendingOrderId {intent.pendingOrderId}</div>
            <div>orderType {String(intent.orderType)}</div>
            <div>expiresAt {intent.expiresAt}</div>
            <div>feeLamports {String(intent.feeLamports)}</div>
            <div>recipient {intent.outputRecipientAddress ?? "—"}</div>
            <div>
              input{" "}
              {intentAmount
                ? `${formatAtomAmount(intentAmount, inputDecimals)} (${intentAmount} atoms)`
                : "—"}
            </div>
            <div className="sm:col-span-2">inputMint {intent.inputMint ?? "—"}</div>
          </dl>
        </div>
      ) : null}

      {phase === "awaiting_approval" ? (
        <div className="flex flex-col gap-3 rounded-[var(--rb-r-md,8px)] border border-amber-200/80 bg-amber-50/50 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-xs leading-5 text-neutral-700 dark:text-neutral-300">
            {form.track === "order"
              ? "Human approval required before Wallet Standard signs the deposit. Review recipient, amount, fee, and expiry above."
              : "Human approval required. Approving builds a V0 transaction from this route and asks your wallet to sign and send. Never id.json."}
          </p>
          {form.track === "spot" && !clusterAllowsDartSend(SOLANA_CHAIN) ? (
            <label className="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <input
                type="checkbox"
                checked={form.targetQuoteChain}
                onChange={(event) =>
                  setForm((current) => ({ ...current, targetQuoteChain: event.target.checked }))
                }
                className="mt-0.5"
              />
              <span>
                Desk cluster is {solanaClusterLabel(SOLANA_CHAIN)}. DART routes are mainnet. Check
                this box to explicitly target the quote chain (mainnet) for send — otherwise Approve
                refuses execution (no fake localnet fill).
              </span>
            </label>
          ) : null}
          {form.track === "spot" && quote?.execution && !connected?.signer ? (
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              No Wallet Standard signer is connected — approving records approval only. Connect a
              wallet to execute.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void approveExecution()}
              className="h-9 rounded-[var(--rb-r-md,8px)] bg-neutral-900 px-3 text-[13px] font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {form.track === "order"
                ? "Approve & sign deposit"
                : quote?.execution &&
                    connected?.signer &&
                    canSendDartSwap({
                      chain: SOLANA_CHAIN,
                      targetQuoteChain: form.targetQuoteChain,
                    })
                  ? "Approve & execute"
                  : "Approve (gate only)"}
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

      {confirmedOrder ? (
        <div className="rounded-[var(--rb-r-md,8px)] border border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Confirmed order (Order schema)</p>
          <dl className="mt-2 grid gap-1 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 sm:grid-cols-2">
            <div>id {confirmedOrder.id}</div>
            <div>status {confirmedOrder.status}</div>
            <div>withdrawalStatus {confirmedOrder.withdrawalStatus}</div>
            <div>
              cycles{" "}
              {confirmedOrder.cyclesCompleted !== undefined && confirmedOrder.totalCycles !== undefined
                ? `${confirmedOrder.cyclesCompleted}/${confirmedOrder.totalCycles}`
                : "—"}
            </div>
            <div>amountSpent {confirmedOrder.amountSpent ?? "—"}</div>
            <div>amountReceived {confirmedOrder.amountReceived ?? "—"}</div>
          </dl>
          {confirmMeta?.txSignature ? (
            <p className="mt-2 truncate font-mono text-[11px] text-neutral-500">
              tx {confirmMeta.txSignature}
            </p>
          ) : null}
        </div>
      ) : null}

      {approvalNote ? (
        <p className="text-xs leading-5 text-neutral-600 dark:text-neutral-400">{approvalNote}</p>
      ) : null}
    </section>
  );
}
