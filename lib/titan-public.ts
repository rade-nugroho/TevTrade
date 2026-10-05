/** Wrapped SOL mint used by Titan swap quotes. */
export const TITAN_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Mainnet USDC mint used by Titan swap quotes. */
export const TITAN_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Decimal scales for the two preset mints.
 * Other mints use the scale Titan returns on the quote.
 */
export const TITAN_MINT_DECIMALS: Readonly<Record<string, number>> = {
  [TITAN_SOL_MINT]: 9,
  [TITAN_USDC_MINT]: 6,
};

/**
 * Converts a decimal amount into an integer string of smallest units.
 * Returns null when the fraction has more digits than `decimals` or the amount is zero.
 */
export function toSmallestUnits(uiAmount: string, decimals: number): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(uiAmount.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) return null;
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  const units = `${whole}${fraction}`.replace(/^0+(?=\d)/, "");
  return units === "0" ? null : units;
}

/**
 * Formats an integer string of smallest units with a fixed decimal scale (formatUnits style).
 */
export function formatUnits(units: string, decimals: number): string {
  const normalized = units.trim().replace(/^0+(?=\d)/, "") || "0";
  if (!/^\d+$/.test(normalized)) return normalized;
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, "") || "0";
  const fraction = decimals === 0 ? "" : padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * Resolves mint decimals from an explicit scale or known preset mints.
 */
export function resolveMintDecimals(mint: string | undefined, decimals: number | undefined): number | null {
  if (typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
    return decimals;
  }
  if (mint && mint in TITAN_MINT_DECIMALS) return TITAN_MINT_DECIMALS[mint] ?? null;
  return null;
}

/**
 * Formats a Titan integer amount for the desk when decimals are known.
 * Returns the raw units string when the scale is unavailable.
 */
export function formatTokenAmount(
  units: string | undefined,
  options?: {
    readonly decimals?: number;
    readonly mint?: string;
    readonly symbol?: string;
  },
): string {
  if (units === undefined) return "—";
  const scale = resolveMintDecimals(options?.mint, options?.decimals);
  const display = scale === null ? units : formatUnits(units, scale);
  const symbol =
    options?.symbol ??
    (options?.mint === TITAN_SOL_MINT ? "SOL" : options?.mint === TITAN_USDC_MINT ? "USDC" : undefined);
  return symbol ? `${display} ${symbol}` : display;
}

/**
 * Short mint label for desk rows.
 */
export function mintLabel(mint: string | undefined): string {
  if (!mint) return "—";
  if (mint === TITAN_SOL_MINT) return "SOL";
  if (mint === TITAN_USDC_MINT) return "USDC";
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

/**
 * One venue hop shown on the desk. Instruction bytes are not included.
 */
export type TitanQuoteStep = {
  readonly label: string;
  readonly inDisplay: string;
  readonly outDisplay: string;
};

/**
 * One priced route. `recommended` is true only for the provider Titan names.
 */
export type TitanQuoteRoute = {
  readonly provider: string;
  readonly recommended: boolean;
  readonly inAmount: string;
  readonly outAmount: string;
  readonly inDisplay: string;
  readonly outDisplay: string;
  readonly slippageBps: number | null;
  readonly steps: readonly TitanQuoteStep[];
};

/**
 * Which Titan HTTP surface produced the quote.
 * DART is the free public `/dart` API. Portal is Developers Portal Gateway.
 */
export type TitanQuoteSource = "dart" | "portal";

/**
 * Display quote returned to the browser. It cannot be signed.
 * Instruction bytes and lookup tables are never included.
 */
export type TitanQuoteView = {
  readonly id: string | null;
  readonly source: TitanQuoteSource;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inputDecimals: number;
  readonly outputDecimals: number;
  readonly inputPriceUsd: number | null;
  readonly outputPriceUsd: number | null;
  readonly recommendedProvider: string;
  readonly routes: readonly TitanQuoteRoute[];
};
