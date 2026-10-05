import "server-only";

import { z } from "zod";
import { readServerEnv } from "@/lib/env";
import {
  formatUnits,
  TITAN_MINT_DECIMALS,
  toSmallestUnits,
  type TitanQuoteRoute,
  type TitanQuoteView,
} from "@/lib/titan-public";

export { formatUnits, toSmallestUnits };

const addressSchema = z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

/**
 * Body accepted by `POST /api/titan/quote`.
 * `uiAmount` is a decimal string such as `0.1`. The server converts it to smallest units.
 */
export const titanQuoteRequestSchema = z.object({
  inputMint: addressSchema,
  outputMint: addressSchema,
  uiAmount: z.string().trim().regex(/^\d+(\.\d+)?$/),
  inputDecimals: z.number().int().min(0).max(18),
  userPublicKey: addressSchema,
  slippageBps: z.number().int().min(1).max(10_000).optional(),
});

/**
 * Inferred Titan quote request.
 */
export type TitanQuoteRequest = z.infer<typeof titanQuoteRequestSchema>;

/**
 * Reads a non-negative integer from a Titan JSON field.
 * Titan encodes u64 values as numbers or decimal strings.
 */
function readUnits(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value) && value !== "0") {
    return value.replace(/^0+(?=\d)/, "");
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

/**
 * Reads a finite number from a Titan JSON field.
 */
function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Reads a short display string and drops control characters.
 */
function readLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const label = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return label || fallback;
}

/**
 * Compares two unsigned integer strings.
 */
function compareUnits(left: string, right: string): number {
  const a = left.replace(/^0+(?=\d)/, "");
  const b = right.replace(/^0+(?=\d)/, "");
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/**
 * Resolves decimals for a known mainnet mint, otherwise the caller-supplied scale.
 */
function decimalsFor(mint: string, fallback: number): number {
  return TITAN_MINT_DECIMALS[mint] ?? fallback;
}

/**
 * Returns the decimal scale for a known mint, or null when the scale is unknown.
 */
function mintDecimals(value: unknown): number | null {
  return typeof value === "string" ? (TITAN_MINT_DECIMALS[value] ?? null) : null;
}

/**
 * Picks display fields from one Titan route and drops instruction payloads.
 */
function readRoute(
  provider: string,
  value: unknown,
  inputDecimals: number,
  outputDecimals: number,
): Omit<TitanQuoteRoute, "recommended"> | null {
  if (!value || typeof value !== "object") return null;
  const route = value as Record<string, unknown>;
  const inAmount = readUnits(route.inAmount);
  const outAmount = readUnits(route.outAmount);
  if (!inAmount || !outAmount) return null;

  const steps = Array.isArray(route.steps)
    ? route.steps.flatMap((step, index) => {
        if (!step || typeof step !== "object") return [];
        const row = step as Record<string, unknown>;
        const stepIn = readUnits(row.inAmount);
        const stepOut = readUnits(row.outAmount);
        const inScale = mintDecimals(row.inputMint);
        const outScale = mintDecimals(row.outputMint);
        return [
          {
            label: readLabel(row.label, `Step ${index + 1}`),
            inDisplay: stepIn && inScale !== null ? formatUnits(stepIn, inScale) : "",
            outDisplay: stepOut && outScale !== null ? formatUnits(stepOut, outScale) : "",
          },
        ];
      })
    : [];

  return {
    provider,
    inAmount,
    outAmount,
    inDisplay: formatUnits(inAmount, inputDecimals),
    outDisplay: formatUnits(outAmount, outputDecimals),
    slippageBps: readNumber(route.slippageBps),
    steps,
  };
}

const quoteEnvelopeSchema = z.object({
  id: z.string().optional(),
  inputMint: z.string(),
  outputMint: z.string(),
  quotes: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Reduces a Titan quote payload to the routes the desk can show.
 * Instruction accounts and data are discarded.
 */
export function toQuoteView(payload: unknown, fallbackInputDecimals: number): TitanQuoteView {
  const parsedResult = quoteEnvelopeSchema.safeParse(payload);
  if (!parsedResult.success) {
    throw new Error("Titan returned a quote the desk could not read.");
  }
  const parsed = parsedResult.data;
  const metadata = parsed.metadata ?? {};
  const inputDecimals = readNumber(metadata.inputMintDecimals) ?? fallbackInputDecimals;
  const outputDecimals = readNumber(metadata.outputMintDecimals) ?? decimalsFor(parsed.outputMint, 0);
  const routes = Object.entries(parsed.quotes).flatMap(([provider, quote]) => {
    const route = readRoute(provider, quote, inputDecimals, outputDecimals);
    return route ? [route] : [];
  });
  if (routes.length === 0) {
    throw new Error("Titan returned no usable route.");
  }

  const namedWinner = readLabel(metadata.expectedWinner ?? metadata.ExpectedWinner, "");
  const recommended = routes.find((route) => route.provider === namedWinner) ?? null;

  return {
    id: parsed.id ?? null,
    source: "portal",
    inputMint: parsed.inputMint,
    outputMint: parsed.outputMint,
    inputDecimals,
    outputDecimals,
    inputPriceUsd: readNumber(metadata.inputPriceUSD),
    outputPriceUsd: readNumber(metadata.outputPriceUSD),
    recommendedProvider: recommended?.provider ?? "",
    routes: routes
      .map((route) => ({ ...route, recommended: route.provider === recommended?.provider }))
      .sort((left, right) => {
        if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
        return compareUnits(right.outAmount, left.outAmount);
      }),
  };
}

/**
 * DART `/swap` response fields used for display.
 * `instructions` and `addressLookupTables` are intentionally omitted.
 */
const dartSwapSchema = z.object({
  inputAmount: z.union([z.string(), z.number()]),
  outputAmount: z.union([z.string(), z.number()]),
  provider: z.string().optional(),
  slippageBps: z.number().optional(),
});

/**
 * Maps a DART swap payload to the desk quote view.
 * Instruction bytes and lookup tables never leave the server.
 */
export function toDartQuoteView(
  payload: unknown,
  request: Pick<TitanQuoteRequest, "inputMint" | "outputMint" | "inputDecimals">,
): TitanQuoteView {
  const parsed = dartSwapSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Titan DART returned a quote the desk could not read.");
  }

  const inAmount = readUnits(parsed.data.inputAmount);
  const outAmount = readUnits(parsed.data.outputAmount);
  if (!inAmount || !outAmount) {
    throw new Error("Titan DART returned no usable amounts.");
  }

  const inputDecimals = decimalsFor(request.inputMint, request.inputDecimals);
  const outputDecimals = decimalsFor(request.outputMint, 0);
  const provider = readLabel(parsed.data.provider, "Titan-DART");

  return {
    id: null,
    source: "dart",
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    inputDecimals,
    outputDecimals,
    inputPriceUsd: null,
    outputPriceUsd: null,
    recommendedProvider: provider,
    routes: [
      {
        provider,
        recommended: true,
        inAmount,
        outAmount,
        inDisplay: formatUnits(inAmount, inputDecimals),
        outDisplay: formatUnits(outAmount, outputDecimals),
        slippageBps: readNumber(parsed.data.slippageBps),
        steps: [],
      },
    ],
  };
}

/**
 * Asks the free public (or partner) DART endpoint for a single-route quote.
 * Never sends `TITAN_API_KEY`. Strips instructions before returning.
 */
async function requestDartQuote(
  request: TitanQuoteRequest,
  amount: string,
  signal?: AbortSignal,
): Promise<TitanQuoteView> {
  const env = readServerEnv();
  const url = `${env.titanDartUrl}/swap`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  // Partner DART key only — Portal keys must not be sent here.
  // DART accepts Bearer or X-API-Key; send both for gateway compatibility.
  if (env.titanDartApiKey) {
    headers["Authorization"] = `Bearer ${env.titanDartApiKey}`;
    headers["X-API-Key"] = env.titanDartApiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount,
      userPublicKey: request.userPublicKey,
      slippageBps: request.slippageBps ?? 50,
    }),
    signal,
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(readTitanError(response.status, body, env.titanDartApiKey ?? ""));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new Error("Titan DART returned a response that was not JSON.");
  }
  return toDartQuoteView(payload, request);
}

/**
 * Asks the Developers Portal Gateway for multi-provider quotes.
 * Never sends `TITAN_DART_API_KEY`.
 */
async function requestPortalQuote(
  request: TitanQuoteRequest,
  amount: string,
  inputDecimals: number,
  signal?: AbortSignal,
): Promise<TitanQuoteView> {
  const env = readServerEnv();
  if (!env.titanApiKey) {
    throw new Error('Set TITAN_API_KEY when TITAN_QUOTE_SOURCE is "portal".');
  }

  const url = new URL("/api/v1/quote/swap", env.titanApiUrl);
  url.searchParams.set("inputMint", request.inputMint);
  url.searchParams.set("outputMint", request.outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("userPublicKey", request.userPublicKey);
  url.searchParams.set("slippageBps", String(request.slippageBps ?? 50));
  url.searchParams.set("numQuotes", "5");
  url.searchParams.set("simulate", "true");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-key": env.titanApiKey,
    },
    signal,
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(readTitanError(response.status, body, env.titanApiKey));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as unknown;
  } catch {
    throw new Error("Titan returned a response that was not JSON.");
  }
  return toQuoteView(payload, inputDecimals);
}

/**
 * Asks Titan for a swap quote and returns the display view.
 * Defaults to public DART (`https://api.titan.exchange/dart`). Set
 * `TITAN_QUOTE_SOURCE=portal` to use the Developers Portal key instead.
 * Keys are never mixed across surfaces. Instruction bytes are stripped.
 */
export async function requestTitanQuote(
  request: TitanQuoteRequest,
  signal?: AbortSignal,
): Promise<TitanQuoteView> {
  const env = readServerEnv();
  const inputDecimals = decimalsFor(request.inputMint, request.inputDecimals);
  const amount = toSmallestUnits(request.uiAmount, inputDecimals);
  if (!amount) {
    throw new Error("Amount must be greater than zero and fit the token decimals.");
  }

  if (env.titanQuoteSource === "portal") {
    return requestPortalQuote(request, amount, inputDecimals, signal);
  }
  return requestDartQuote(request, amount, signal);
}

/**
 * Turns a Titan error into a short message that does not include API keys.
 */
function readTitanError(status: number, body: string, apiKey: string): string {
  let text = body.replace(/[\u0000-\u001f]/g, " ").trim();
  if (apiKey) text = text.replaceAll(apiKey, "");
  if (status === 401 || status === 403) return "Titan rejected the API key.";
  if (status === 429) {
    return "Titan rate limit reached (public DART allows 1 request per second). Wait a moment and try again.";
  }
  if (status === 404) {
    return "Titan found no route for this pair. DART supports a fixed mainnet market list.";
  }

  try {
    const parsed = JSON.parse(text) as {
      code?: number;
      message?: string;
      error?: string;
      metadata?: { errors?: Record<string, unknown> };
    };
    if (parsed.code === -7) {
      const reasons = parsed.metadata?.errors
        ? Object.entries(parsed.metadata.errors)
            .flatMap(([provider, reason]) => (typeof reason === "string" ? [`${provider}: ${reason}`] : []))
            .join(", ")
        : "";
      return reasons
        ? `Titan found no route. ${reasons}`
        : "Titan found no route. Check the wallet address and the amount.";
    }
    const detail =
      (typeof parsed.message === "string" && parsed.message.trim()) ||
      (typeof parsed.error === "string" && parsed.error.trim()) ||
      "";
    if (detail) {
      return `Titan quote failed (${status}): ${detail.slice(0, 160)}`;
    }
  } catch {
    // Titan sometimes returns a plain-text validation error.
  }

  return text ? `Titan quote failed (${status}): ${text.slice(0, 180)}` : `Titan quote failed (${status}).`;
}
