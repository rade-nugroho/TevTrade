import "server-only";

import { V1Client, types, ConnectionClosed } from "@titanexchange/sdk-ts";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { z } from "zod";
import { readServerEnv } from "@/lib/env";
import { toSmallestUnits } from "@/lib/titan";
import { TITAN_SOL_MINT, TITAN_USDC_MINT } from "@/lib/titan-public";

const STREAM_MAX_MS = 30_000;
const RECONNECT_BACKOFF_MS = 400;

/**
 * Address schema shared by Direct quote HTTP routes.
 */
const addressSchema = z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

/**
 * One-shot Direct price request from the browser.
 */
export const titanDirectPriceRequestSchema = z.object({
  inputMint: addressSchema.default(TITAN_SOL_MINT),
  outputMint: addressSchema.default(TITAN_USDC_MINT),
  uiAmount: z.string().trim().regex(/^\d+(\.\d+)?$/),
  inputDecimals: z.number().int().min(0).max(18).default(9),
  userPublicKey: addressSchema.optional(),
  slippageBps: z.number().int().min(1).max(10_000).optional(),
});

/**
 * Inferred Direct price request.
 */
export type TitanDirectPriceRequest = z.infer<typeof titanDirectPriceRequestSchema>;

/**
 * Stream quote request from the browser.
 */
export const titanDirectStreamRequestSchema = titanDirectPriceRequestSchema.extend({
  userPublicKey: addressSchema,
  intervalMs: z.number().int().min(250).max(10_000).optional(),
  numQuotes: z.number().int().min(1).max(10).optional(),
});

/**
 * Inferred Direct stream request.
 */
export type TitanDirectStreamRequest = z.infer<typeof titanDirectStreamRequestSchema>;

/**
 * JSON-safe Direct price view.
 */
export type TitanDirectPriceView = {
  readonly id: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountIn: string;
  readonly amountOut: string;
};

/**
 * JSON-safe Direct stream update.
 */
export type TitanDirectStreamUpdate = {
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
 * Error thrown when Direct JWT/endpoint env is missing.
 */
export class TitanDirectConfigError extends Error {
  /**
   * Creates a Direct configuration error.
   */
  constructor(message: string) {
    super(message);
    this.name = "TitanDirectConfigError";
  }
}

/**
 * Builds the authenticated WebSocket URL for V1Client.
 */
function buildDirectWsUrl(): string {
  const env = readServerEnv();
  if (!env.titanEndpoint || !env.titanJwt) {
    throw new TitanDirectConfigError("Set TITAN_ENDPOINT and TITAN_JWT for Direct quotes.");
  }
  const host = env.titanEndpoint.replace(/^wss?:\/\//, "").replace(/\/$/, "");
  return `wss://${host}/api/v1/ws?auth=${env.titanJwt}`;
}

/**
 * Decodes a base58 mint or wallet into the 32-byte pubkey the SDK expects.
 * Mints may be off-curve PDAs, so only the byte length is enforced here.
 */
function decodePubkey(value: string): Uint8Array {
  const bytes = getBase58Encoder().encode(value);
  if (bytes.byteLength !== 32) {
    throw new Error("Mint and wallet addresses must decode to 32 bytes.");
  }
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/**
 * Encodes a pubkey or raw amount for JSON responses.
 */
function encodePubkey(value: Uint8Array): string {
  return getBase58Decoder().decode(value);
}

/**
 * Converts a Uint64-like value into a decimal string.
 */
function unitsToString(value: number | bigint | string | undefined): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
  return "0";
}

/**
 * Reads ExpectedWinner from stream metadata when the SDK payload includes it.
 */
function readExpectedWinner(quotes: unknown): string | null {
  if (!quotes || typeof quotes !== "object") return null;
  const row = quotes as { metadata?: unknown };
  if (!row.metadata || typeof row.metadata !== "object") return null;
  const meta = row.metadata as Record<string, unknown>;
  const winner = meta.ExpectedWinner ?? meta.expectedWinner;
  return typeof winner === "string" && winner.trim() ? winner.trim() : null;
}

/**
 * Connects a V1Client and runs one operation, reconnecting once on an unclean close.
 */
async function withDirectClient<T>(operation: (client: V1Client) => Promise<T>): Promise<T> {
  const url = buildDirectWsUrl();
  let attempt = 0;
  let lastError: unknown;

  while (attempt < 2) {
    attempt += 1;
    const client = await V1Client.connect(url);
    try {
      return await operation(client);
    } catch (error) {
      lastError = error;
      const unclean = error instanceof ConnectionClosed && error.wasClean === false;
      if (!unclean || attempt >= 2) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_BACKOFF_MS));
    } finally {
      if (!client.closed) {
        try {
          await client.close();
        } catch {
          // The socket may already be closed after an unclean disconnect.
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Titan Direct request failed.");
}

/**
 * Turns an SDK / connection error into a short message without leaking the JWT.
 */
export function readDirectError(error: unknown): { status: number; message: string; code: string } {
  if (error instanceof TitanDirectConfigError) {
    return { status: 503, message: error.message, code: "NOT_CONFIGURED" };
  }
  if (error instanceof Error) {
    const name = error.name || error.constructor.name || "Error";
    return {
      status: 502,
      message: `${name}: ${error.message}`.slice(0, 240),
      code: name,
    };
  }
  return { status: 502, message: "Titan Direct request failed.", code: "TITAN_ERROR" };
}

/**
 * Requests a one-shot swap price through the Direct SDK.
 */
export async function requestDirectSwapPrice(request: TitanDirectPriceRequest): Promise<TitanDirectPriceView> {
  const amount = toSmallestUnits(request.uiAmount, request.inputDecimals);
  if (!amount) {
    throw new Error("Amount must be greater than zero and fit the token decimals.");
  }

  const price = await withDirectClient((client) =>
    client.getSwapPrice({
      inputMint: decodePubkey(request.inputMint),
      outputMint: decodePubkey(request.outputMint),
      amount: BigInt(amount),
    }),
  );

  return {
    id: price.id,
    inputMint: encodePubkey(price.inputMint),
    outputMint: encodePubkey(price.outputMint),
    amountIn: unitsToString(price.amountIn),
    amountOut: unitsToString(price.amountOut),
  };
}

/**
 * Opens a Direct quote stream and writes NDJSON lines until disconnect or the 30s cap.
 */
export async function streamDirectQuotes(
  request: TitanDirectStreamRequest,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  const amount = toSmallestUnits(request.uiAmount, request.inputDecimals);
  if (!amount) {
    throw new Error("Amount must be greater than zero and fit the token decimals.");
  }

  const encoder = new TextEncoder();
  const writeLine = async (value: unknown) => {
    await writer.write(encoder.encode(`${JSON.stringify(value)}\n`));
  };

  await withDirectClient(async (client) => {
    const { stream, streamId } = await client.newSwapQuoteStream({
      swap: {
        inputMint: decodePubkey(request.inputMint),
        outputMint: decodePubkey(request.outputMint),
        amount: BigInt(amount),
        slippageBps: request.slippageBps,
      },
      transaction: {
        userPublicKey: decodePubkey(request.userPublicKey),
        transactionFormat: types.v1.TransactionFormat.V0,
      },
      update: {
        intervalMs: request.intervalMs,
        numQuotes: request.numQuotes ?? 3,
      },
    });

    const reader = stream.getReader();

    const timeout = setTimeout(() => {
      void reader.cancel("duration_cap").catch(() => undefined);
    }, STREAM_MAX_MS);

    const onAbort = () => {
      void client.stopStream(streamId).catch(() => undefined);
      void reader.cancel("client_disconnect").catch(() => undefined);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done || !value) break;

        const expectedWinner = readExpectedWinner(value);
        const routes = Object.entries(value.quotes ?? {}).map(([provider, route]) => ({
          provider,
          inAmount: unitsToString(route.inAmount),
          outAmount: unitsToString(route.outAmount),
          slippageBps: typeof route.slippageBps === "number" ? route.slippageBps : null,
        }));
        const winnerRoute = expectedWinner ? value.quotes?.[expectedWinner] : undefined;
        const update: TitanDirectStreamUpdate = {
          id: value.id,
          expectedWinner,
          winnerOutAmount: winnerRoute ? unitsToString(winnerRoute.outAmount) : null,
          routes,
        };
        await writeLine({ type: "quote", ...update });
      }
      await writeLine({ type: "end", reason: signal.aborted ? "client_disconnect" : "complete" });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      try {
        await client.stopStream(streamId);
      } catch {
        // Stream may already be stopped by cancel or server end.
      }
    }
  });
}
