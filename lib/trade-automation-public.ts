import { z } from "zod";
import type { TitanOrderType } from "@/lib/titan-order-schema";
import { toSmallestUnits } from "@/lib/titan-public";

/**
 * Tev1 stance keys the automation desk understands.
 * Letters map to these keys in `lib/ollama.ts`; they are not trade authority.
 */
export const automationStanceSchema = z.enum(["add", "stand_aside", "none", "unknown"]);

/**
 * Inferred automation stance.
 */
export type AutomationStance = z.infer<typeof automationStanceSchema>;

/**
 * Automation track.
 * - `spot` — DART/Portal quote only (no Special Orders deposit).
 * - `order` — Titan Special Order Types intent → approve → Wallet Standard sign → confirm.
 */
export const automationTrackSchema = z.enum(["spot", "order"]);

/**
 * Inferred automation track.
 */
export type AutomationTrack = z.infer<typeof automationTrackSchema>;

/**
 * Workflow phases for the Trade Automation desk.
 * Spot track continues through Wallet Standard sign + send after explicit approve.
 * Order track continues through Wallet Standard sign + partner confirm after explicit approve.
 */
export const automationPhaseSchema = z.enum([
  "idle",
  "deciding",
  "decided",
  "quoting",
  "quoted",
  "intenting",
  "awaiting_approval",
  "signing",
  "executing",
  "confirming",
  "confirmed",
  "executed",
  "approved",
  "rejected",
  "error",
]);

/**
 * Inferred automation phase.
 */
export type AutomationPhase = z.infer<typeof automationPhaseSchema>;

/**
 * Price denomination for trigger-order configs (`stop_loss` / `take_profit`).
 */
export const automationPriceBasisSchema = z.enum(["pair", "usd"]);

/**
 * Inferred price basis for automation trigger configs.
 */
export type AutomationPriceBasis = z.infer<typeof automationPriceBasisSchema>;

/**
 * Fields shared by desk order-config builders.
 */
export type AutomationOrderFormInput = {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inputDecimals: number;
  readonly uiAmount: string;
  readonly amountPerCycleUi: string;
  readonly cycleFrequencySeconds: string;
  readonly totalCycles: string;
  readonly triggerPriceUi: string;
  readonly priceDecimals: string;
  readonly priceBasis: AutomationPriceBasis;
  readonly minOutputUi: string;
  readonly outputDecimals: number;
  readonly trailingStopBps: string;
};

/**
 * Parses the stance key from Tev1 assistant text produced by `streamOllamaDecision`.
 *
 * @param text - Assistant decision text.
 * @returns Mapped stance, or `unknown` when the text does not name a choice.
 */
export function parseAutomationStance(text: string): AutomationStance {
  const match = /Choice:\s*([a-z_ ]+)/i.exec(text);
  if (!match?.[1]) return "unknown";
  const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "add") return "add";
  if (key === "stand_aside") return "stand_aside";
  if (key === "none") return "none";
  return "unknown";
}

/**
 * Returns whether the stance may proceed to a quote or order intent.
 * Only `add` advances; other stances stop before market contact.
 *
 * @param stance - Parsed Tev1 stance.
 * @returns True when the desk should request a quote or order intent.
 */
export function stanceAllowsQuote(stance: AutomationStance): boolean {
  return stance === "add";
}

/**
 * Human label for a stance key.
 *
 * @param stance - Parsed stance.
 * @returns Short operator-facing label.
 */
export function stanceLabel(stance: AutomationStance): string {
  switch (stance) {
    case "add":
      return "Add (take the trade)";
    case "stand_aside":
      return "Stand aside";
    case "none":
      return "None fit";
    default:
      return "Unknown";
  }
}

/**
 * Human label for an automation track.
 *
 * @param track - Spot quote or Special Orders automation.
 * @returns Short operator-facing label.
 */
export function trackLabel(track: AutomationTrack): string {
  return track === "spot" ? "Spot quote (DART/Portal)" : "Scheduled order (Special Types)";
}

/**
 * Order types the Automation desk can build configs for (happy path).
 * `oco` and `slice` still need the Orders raw-JSON surface.
 *
 * @param orderType - Selected Titan order type.
 * @returns True when Automation can assemble a typed config.
 */
export function automationSupportsOrderType(orderType: TitanOrderType): boolean {
  return orderType === "dca" || orderType === "stop_loss" || orderType === "take_profit";
}

/**
 * Converts a decimal UI price into a fixed-point integer string.
 *
 * @param uiPrice - Decimal string such as `150.5`.
 * @param priceDecimals - Scale `0`–`18`.
 * @returns Fixed-point atom string, or null when invalid / zero.
 */
export function toFixedPointPrice(uiPrice: string, priceDecimals: number): string | null {
  return toSmallestUnits(uiPrice, priceDecimals);
}

/**
 * Builds a DCA create `config` from desk fields.
 *
 * @param form - Automation form amounts and mints.
 * @returns Config object, or null when fields are invalid.
 */
export function buildDcaOrderConfig(form: AutomationOrderFormInput): Record<string, unknown> | null {
  const totalAmount = toSmallestUnits(form.uiAmount, form.inputDecimals);
  const amountPerCycle = toSmallestUnits(form.amountPerCycleUi, form.inputDecimals);
  const cycleFrequencySeconds = Number(form.cycleFrequencySeconds);
  const totalCycles = Number(form.totalCycles);
  if (!totalAmount || !amountPerCycle) return null;
  if (!Number.isInteger(cycleFrequencySeconds) || cycleFrequencySeconds < 60) return null;
  if (!Number.isInteger(totalCycles) || totalCycles <= 0) return null;
  return {
    inputMint: form.inputMint.trim(),
    outputMint: form.outputMint.trim(),
    totalAmount,
    amountPerCycle,
    cycleFrequencySeconds,
    totalCycles,
  };
}

/**
 * Builds a `stop_loss` or `take_profit` create `config` from desk fields.
 * Shape matches Titan Special Order Types docs (identical fields; direction differs by type).
 *
 * @param form - Automation form amounts, trigger, and price basis.
 * @returns Config object, or null when fields are invalid.
 */
export function buildTriggerOrderConfig(
  form: AutomationOrderFormInput,
): Record<string, unknown> | null {
  const amount = toSmallestUnits(form.uiAmount, form.inputDecimals);
  const priceDecimals = Number(form.priceDecimals);
  if (!amount) return null;
  if (!Number.isInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 18) return null;
  const triggerPrice = toFixedPointPrice(form.triggerPriceUi, priceDecimals);
  if (!triggerPrice) return null;

  const config: Record<string, unknown> = {
    inputMint: form.inputMint.trim(),
    outputMint: form.outputMint.trim(),
    amount,
    triggerPrice,
    priceDecimals,
    priceBasis: form.priceBasis,
  };

  const minOutputTrimmed = form.minOutputUi.trim();
  if (minOutputTrimmed) {
    const minOutputAmount = toSmallestUnits(minOutputTrimmed, form.outputDecimals);
    if (!minOutputAmount) return null;
    config.minOutputAmount = minOutputAmount;
  }

  const trailingTrimmed = form.trailingStopBps.trim();
  if (trailingTrimmed) {
    const trailingStopBps = Number(trailingTrimmed);
    if (!Number.isInteger(trailingStopBps) || trailingStopBps < 1 || trailingStopBps > 9999) {
      return null;
    }
    config.trailingStopBps = trailingStopBps;
  }

  return config;
}

/**
 * Builds the partner `config` for the selected automation order type.
 *
 * @param orderType - Titan order type.
 * @param form - Automation form fields.
 * @returns Config object, or null when the type is unsupported or fields are invalid.
 */
export function buildAutomationOrderConfig(
  orderType: TitanOrderType,
  form: AutomationOrderFormInput,
): Record<string, unknown> | null {
  if (orderType === "dca") return buildDcaOrderConfig(form);
  if (orderType === "stop_loss" || orderType === "take_profit") {
    return buildTriggerOrderConfig(form);
  }
  return null;
}
