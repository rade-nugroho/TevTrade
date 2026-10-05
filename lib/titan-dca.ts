import "server-only";

import { z } from "zod";
import { readServerEnv } from "@/lib/env";
import {
  titanOnboardRequestSchema,
  titanOnboardResultSchema,
  titanOrderConfirmRequestSchema,
  titanOrderConfirmResultSchema,
  titanOrderDepositResultSchema,
  titanOrderIntentRequestSchema,
  titanOrderIntentResultSchema,
  type TitanOnboardRequest,
  type TitanOnboardResult,
  type TitanOrderConfirmRequest,
  type TitanOrderConfirmResult,
  type TitanOrderDepositResult,
  type TitanOrderIntentRequest,
  type TitanOrderIntentResult,
  type TitanPartnerError,
} from "@/lib/titan-dca-public";

const SIWS_MAX_BYTES = 1024;
const SIWS_SKEW_MS = 10 * 60 * 1000;

/**
 * Error thrown when Titan partner configuration is missing.
 */
export class TitanDcaConfigError extends Error {
  /**
   * Creates a configuration error.
   */
  constructor(message: string) {
    super(message);
    this.name = "TitanDcaConfigError";
  }
}

/**
 * Error that carries a Titan partner HTTP status and error code.
 */
export class TitanPartnerApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  /**
   * Creates a partner API error.
   */
  constructor(error: TitanPartnerError) {
    super(error.message);
    this.name = "TitanPartnerApiError";
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }

  /**
   * Serializes the error for a JSON response.
   */
  toJSON(): TitanPartnerError {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Parses the canonical SIWS message and rejects invalid form or stale Issued At.
 */
export function validateSiwsMessage(message: string, userPubkey: string, sub: string): void {
  const bytes = new TextEncoder().encode(message);
  if (bytes.byteLength === 0 || bytes.byteLength > SIWS_MAX_BYTES) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS message must be 1–1024 UTF-8 bytes.",
    });
  }
  if (message.includes("\r")) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS message must use LF line endings.",
    });
  }
  if (!message.endsWith("\n")) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS message must end with a newline after Nonce.",
    });
  }

  const expectedPrefix = "Titan DCA wants you to link this Solana wallet.\n\n";
  if (!message.startsWith(expectedPrefix)) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS message header does not match the canonical form.",
    });
  }

  const lines = message.slice(expectedPrefix.length).split("\n");
  // Trailing newline produces a final empty entry.
  if (lines.length !== 5 || lines[4] !== "") {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS message line layout is invalid.",
    });
  }

  const addressLine = lines[0];
  const userLine = lines[1];
  const issuedLine = lines[2];
  const nonceLine = lines[3];

  if (addressLine !== `Address: ${userPubkey}`) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS Address must equal userPubkey.",
    });
  }
  if (userLine !== `User: ${sub}`) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS User must equal sub.",
    });
  }
  if (!issuedLine.startsWith("Issued At: ")) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS Issued At line is missing.",
    });
  }
  if (!nonceLine.startsWith("Nonce: ") || nonceLine.length <= "Nonce: ".length) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS Nonce line is missing.",
    });
  }

  const issuedAt = Date.parse(issuedLine.slice("Issued At: ".length));
  if (!Number.isFinite(issuedAt)) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS Issued At is not a valid timestamp.",
    });
  }
  const skew = Math.abs(Date.now() - issuedAt);
  if (skew > SIWS_SKEW_MS) {
    throw new TitanPartnerApiError({
      status: 400,
      code: "SIWS_INVALID",
      message: "SIWS Issued At is outside the ±10 minute window.",
    });
  }
}

/**
 * Reads Titan DCA env and throws when the partner key or base URL is missing.
 */
function requireDcaEnv(): { baseUrl: string; apiKey: string } {
  const env = readServerEnv();
  if (!env.titanDcaBaseUrl || !env.titanDcaApiKey) {
    throw new TitanDcaConfigError("Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY for partner routes.");
  }
  return { baseUrl: env.titanDcaBaseUrl.replace(/\/$/, ""), apiKey: env.titanDcaApiKey };
}

/**
 * Redacts the API key from a Titan error body before it reaches the client.
 */
function redactSecrets(text: string, apiKey: string): string {
  return text.replaceAll(apiKey, "").replace(/[\u0000-\u001f]/g, " ").trim();
}

/**
 * Parses a Titan partner error envelope without leaking secrets.
 */
function readPartnerError(status: number, body: string, apiKey: string): TitanPartnerError {
  const text = redactSecrets(body, apiKey);
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: string; message?: string; details?: unknown };
      code?: string;
      message?: string;
      details?: unknown;
    };
    const code =
      (typeof parsed.error?.code === "string" && parsed.error.code) ||
      (typeof parsed.code === "string" && parsed.code) ||
      "TITAN_ERROR";
    const message =
      (typeof parsed.error?.message === "string" && parsed.error.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      text ||
      `Titan partner request failed (${status}).`;
    return {
      status,
      code,
      message: message.slice(0, 240),
      details: parsed.error?.details ?? parsed.details,
    };
  } catch {
    return {
      status,
      code: "TITAN_ERROR",
      message: text ? text.slice(0, 240) : `Titan partner request failed (${status}).`,
    };
  }
}

/**
 * Calls a Titan DCA partner endpoint with the partner key and optional user header.
 */
async function callTitanDca(
  path: string,
  options: {
    readonly method: "GET" | "POST";
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly sub?: string;
    readonly body?: unknown;
    readonly idempotencyKey?: string;
    readonly signal?: AbortSignal;
  },
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Titan-Key": options.apiKey,
  };
  if (options.sub) headers["X-Titan-User"] = options.sub;
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${options.baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new TitanPartnerApiError(readPartnerError(response.status, text, options.apiKey));
  }

  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TitanPartnerApiError({
      status: 502,
      code: "TITAN_ERROR",
      message: "Titan returned a response that was not JSON.",
    });
  }
}

/**
 * Unwraps `{ data: T }` envelopes when present.
 */
function unwrapData(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

/**
 * Onboards a user through SIWS. Uses X-Titan-Key only.
 */
export async function onboardPartnerUser(
  request: TitanOnboardRequest,
  signal?: AbortSignal,
): Promise<TitanOnboardResult> {
  const parsed = titanOnboardRequestSchema.parse(request);
  validateSiwsMessage(parsed.message, parsed.userPubkey, parsed.sub);

  const { baseUrl, apiKey } = requireDcaEnv();
  const payload = await callTitanDca("/partner/onboard", {
    method: "POST",
    baseUrl,
    apiKey,
    signal,
    body: {
      sub: parsed.sub,
      userPubkey: parsed.userPubkey,
      siws: {
        message: parsed.message,
        signature: parsed.signature,
      },
    },
  });

  const data = unwrapData(payload);
  const result = z
    .object({
      userId: z.string().min(1),
      walletAddress: z.string().min(1),
    })
    .safeParse(data);
  if (!result.success) {
    throw new TitanPartnerApiError({
      status: 502,
      code: "TITAN_ERROR",
      message: "Titan onboard response was missing userId or walletAddress.",
    });
  }

  return titanOnboardResultSchema.parse({
    userId: result.data.userId,
    walletAddress: result.data.walletAddress,
    sub: parsed.sub,
  });
}

/**
 * Creates a pending order intent and returns the unsigned deposit transaction.
 */
export async function createOrderIntent(
  request: TitanOrderIntentRequest,
  signal?: AbortSignal,
): Promise<TitanOrderIntentResult> {
  const parsed = titanOrderIntentRequestSchema.parse(request);
  const { baseUrl, apiKey } = requireDcaEnv();

  const body: Record<string, unknown> = {
    orderType: parsed.orderType,
    userPubkey: parsed.userPubkey,
    config: parsed.config,
  };
  if (parsed.onboardIfNeeded === true) body.onboardIfNeeded = true;
  if (parsed.outputRecipientAddress) body.outputRecipientAddress = parsed.outputRecipientAddress;
  if (parsed.platformFee) body.platformFee = parsed.platformFee;

  const payload = await callTitanDca("/orders/intent", {
    method: "POST",
    baseUrl,
    apiKey,
    sub: parsed.sub,
    body,
    idempotencyKey: parsed.idempotencyKey,
    signal,
  });

  const data = unwrapData(payload);
  const result = titanOrderIntentResultSchema.safeParse(data);
  if (!result.success) {
    throw new TitanPartnerApiError({
      status: 502,
      code: "TITAN_ERROR",
      message: "Titan intent response was missing required fields.",
    });
  }
  return result.data;
}

/**
 * Confirms a pending order with the signed deposit transaction.
 */
export async function confirmOrder(
  request: TitanOrderConfirmRequest,
  signal?: AbortSignal,
): Promise<TitanOrderConfirmResult> {
  const parsed = titanOrderConfirmRequestSchema.parse(request);
  const { baseUrl, apiKey } = requireDcaEnv();

  const payload = await callTitanDca("/orders/confirm", {
    method: "POST",
    baseUrl,
    apiKey,
    sub: parsed.sub,
    body: {
      pendingOrderId: parsed.pendingOrderId,
      signedTransaction: parsed.signedTransaction,
    },
    idempotencyKey: parsed.idempotencyKey,
    signal,
  });

  const data = unwrapData(payload);
  if (!data || typeof data !== "object") {
    throw new TitanPartnerApiError({
      status: 502,
      code: "TITAN_ERROR",
      message: "Titan confirm response was empty.",
    });
  }

  const row = data as Record<string, unknown>;
  const order = "order" in row ? row.order : row;
  const txSignature =
    typeof row.txSignature === "string"
      ? row.txSignature
      : typeof (order as { txSignature?: unknown } | null)?.txSignature === "string"
        ? (order as { txSignature: string }).txSignature
        : undefined;
  const orderId =
    typeof row.orderId === "string"
      ? row.orderId
      : typeof (order as { id?: unknown } | null)?.id === "string"
        ? (order as { id: string }).id
        : typeof (order as { orderId?: unknown } | null)?.orderId === "string"
          ? (order as { orderId: string }).orderId
          : undefined;
  const status =
    typeof row.status === "string"
      ? row.status
      : typeof (order as { status?: unknown } | null)?.status === "string"
        ? (order as { status: string }).status
        : undefined;

  return titanOrderConfirmResultSchema.parse({
    order,
    txSignature,
    orderId,
    status,
  });
}

/**
 * Looks up the deposit transfer recorded for an order.
 */
export async function getOrderDeposit(
  sub: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<TitanOrderDepositResult> {
  const { baseUrl, apiKey } = requireDcaEnv();
  const payload = await callTitanDca(`/orders/${encodeURIComponent(orderId)}/deposit`, {
    method: "GET",
    baseUrl,
    apiKey,
    sub,
    signal,
  });
  const data = unwrapData(payload);
  const result = titanOrderDepositResultSchema.safeParse(data);
  if (!result.success) {
    throw new TitanPartnerApiError({
      status: 502,
      code: "TITAN_ERROR",
      message: "Titan deposit response was missing txSignature.",
    });
  }
  return result.data;
}

/**
 * Maps partner/library errors to an HTTP Response.
 */
export function partnerErrorResponse(error: unknown): Response {
  if (error instanceof TitanDcaConfigError) {
    return Response.json({ error: error.message, code: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (error instanceof TitanPartnerApiError) {
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json({ error: "Request validation failed.", code: "BAD_REQUEST" }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Titan partner request failed.";
  return Response.json({ error: message, code: "TITAN_ERROR" }, { status: 502 });
}
