import { z } from "zod";

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
 * Spot track stops at `approved` (sign stubbed).
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
  "confirming",
  "confirmed",
  "approved",
  "rejected",
  "error",
]);

/**
 * Inferred automation phase.
 */
export type AutomationPhase = z.infer<typeof automationPhaseSchema>;

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
