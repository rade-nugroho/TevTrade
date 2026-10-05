import { z } from "zod";

/**
 * Solana base58 address used by Titan partner routes.
 */
export const titanAddressSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

/**
 * Stable partner user id (`sub`). TevTrade uses the connected wallet pubkey.
 */
export const titanSubSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[1-9A-HJ-NP-Za-km-z:_-]{1,128}$/);

/**
 * Supported Titan partner order types.
 */
export const titanOrderTypeSchema = z.enum([
  "dca",
  "stop_loss",
  "take_profit",
  "oco",
  "slice",
]);

/**
 * Inferred Titan order type.
 */
export type TitanOrderType = z.infer<typeof titanOrderTypeSchema>;

/**
 * Unverified per-type order config.
 * Public Titan partner docs in this repo do not list authoritative field names,
 * so the desk accepts a JSON object and does not invent typed DCA fields.
 */
export const titanOrderConfigSchema = z.record(z.string(), z.unknown());

/**
 * Inferred open order config.
 */
export type TitanOrderConfig = z.infer<typeof titanOrderConfigSchema>;

/**
 * Optional per-order platform fee override.
 */
export const titanPlatformFeeSchema = z.object({
  bps: z.number().int().min(0).max(10_000),
});

/**
 * Body the browser posts to `POST /api/titan/onboard`.
 */
export const titanOnboardRequestSchema = z.object({
  sub: titanSubSchema,
  userPubkey: titanAddressSchema,
  message: z.string().min(1).max(1024),
  signature: z
    .string()
    .trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
});

/**
 * Inferred onboard request.
 */
export type TitanOnboardRequest = z.infer<typeof titanOnboardRequestSchema>;

/**
 * Successful onboard payload returned to the browser.
 */
export const titanOnboardResultSchema = z.object({
  userId: z.string().min(1),
  walletAddress: titanAddressSchema,
  sub: titanSubSchema,
});

/**
 * Inferred onboard result.
 */
export type TitanOnboardResult = z.infer<typeof titanOnboardResultSchema>;

/**
 * Shared fields for `POST /orders/intent`.
 */
export const titanOrderIntentRequestSchema = z.object({
  sub: titanSubSchema,
  orderType: titanOrderTypeSchema,
  userPubkey: titanAddressSchema,
  config: titanOrderConfigSchema,
  onboardIfNeeded: z.literal(true).optional(),
  outputRecipientAddress: titanAddressSchema.optional(),
  platformFee: titanPlatformFeeSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

/**
 * Inferred intent request.
 */
export type TitanOrderIntentRequest = z.infer<typeof titanOrderIntentRequestSchema>;

/**
 * Intent preview fields shown before the user signs the deposit.
 */
export const titanOrderIntentResultSchema = z.object({
  pendingOrderId: z.string().min(1),
  memoId: z.string().optional(),
  transaction: z.string().min(1),
  encoding: z.literal("base64").or(z.string()).optional(),
  expiresAt: z.string().min(1),
  orderType: titanOrderTypeSchema.or(z.string()),
  outputRecipientAddress: z.string().optional(),
  inputMint: z.string().optional(),
  inputAmount: z.union([z.string(), z.number()]).optional(),
  feeLamports: z.union([z.string(), z.number()]),
});

/**
 * Inferred intent result.
 */
export type TitanOrderIntentResult = z.infer<typeof titanOrderIntentResultSchema>;

/**
 * Body the browser posts to `POST /api/titan/orders/confirm`.
 */
export const titanOrderConfirmRequestSchema = z.object({
  sub: titanSubSchema,
  pendingOrderId: z.string().trim().min(1),
  signedTransaction: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
});

/**
 * Inferred confirm request.
 */
export type TitanOrderConfirmRequest = z.infer<typeof titanOrderConfirmRequestSchema>;

/**
 * Confirm response fields shown after activation.
 */
export const titanOrderConfirmResultSchema = z.object({
  order: z.unknown(),
  txSignature: z.string().optional(),
  orderId: z.string().optional(),
  status: z.string().optional(),
});

/**
 * Inferred confirm result.
 */
export type TitanOrderConfirmResult = z.infer<typeof titanOrderConfirmResultSchema>;

/**
 * Deposit lookup response.
 */
export const titanOrderDepositResultSchema = z.object({
  txSignature: z.string().min(1),
  submittedAt: z.string().optional(),
});

/**
 * Inferred deposit result.
 */
export type TitanOrderDepositResult = z.infer<typeof titanOrderDepositResultSchema>;

/**
 * Titan error payload surfaced to the UI.
 */
export type TitanPartnerError = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
};

/**
 * Local session stored after a successful SIWS onboard.
 */
export type TitanSession = {
  readonly sub: string;
  readonly userId: string;
  readonly walletAddress: string;
};

const SESSION_PREFIX = "tevtrade:titan-session:";

/**
 * Builds the canonical SIWS message bytes as a UTF-8 string.
 * Uses LF endings and a trailing newline after Nonce. Must stay ≤ 1024 bytes.
 */
export function buildSiwsMessage(address: string, sub: string, issuedAt = new Date(), nonce = crypto.randomUUID()): string {
  return (
    `Titan DCA wants you to link this Solana wallet.\n\n` +
    `Address: ${address}\n` +
    `User: ${sub}\n` +
    `Issued At: ${issuedAt.toISOString()}\n` +
    `Nonce: ${nonce}\n`
  );
}

/**
 * Derives the stable Titan `sub` from the connected wallet pubkey.
 * TevTrade has no separate auth user, so the wallet address is the identity.
 */
export function titanSubFromWallet(userPubkey: string): string {
  return userPubkey.trim();
}

/**
 * Returns the localStorage key for a Titan session.
 */
export function titanSessionStorageKey(sub: string): string {
  return `${SESSION_PREFIX}${sub}`;
}

/**
 * Reads a stored Titan session for the given sub.
 */
export function readTitanSession(sub: string): TitanSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(titanSessionStorageKey(sub));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const result = titanOnboardResultSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Persists a Titan session for later order calls.
 */
export function writeTitanSession(session: TitanSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(titanSessionStorageKey(session.sub), JSON.stringify(session));
}

/**
 * Builds a deterministic idempotency key for one create attempt.
 */
export function buildOrderIdempotencyKey(orderType: TitanOrderType, attemptId: string): string {
  return `${orderType}:create:${attemptId}:v1`;
}
