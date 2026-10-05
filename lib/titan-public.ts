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
 * Display quote returned to the browser. It cannot be signed.
 */
export type TitanQuoteView = {
  readonly id: string | null;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inputDecimals: number;
  readonly outputDecimals: number;
  readonly inputPriceUsd: number | null;
  readonly outputPriceUsd: number | null;
  readonly recommendedProvider: string;
  readonly routes: readonly TitanQuoteRoute[];
};
