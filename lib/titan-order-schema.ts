import { z } from "zod";

/**
 * Titan Special Order Types — Order & Execution Schema (authoritative).
 *
 * Conventions:
 * - Amounts are integer **strings** in mint smallest units (never JS floats).
 * - Timestamps are ISO-8601 unless a write path notes Unix seconds
 *   (`expiresAt` is sent as Unix seconds, returned as ISO).
 * - Order / execution ids are opaque UUIDv4; Titan `userId` is opaque.
 * - Ignore undocumented / legacy fields: `entryPrice`, `minProfitBps`,
 *   `scaleSteps`, `chunkSignatures`, `executionInFlight`.
 */

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
 * Inferred order type.
 */
export type TitanOrderType = z.infer<typeof titanOrderTypeSchema>;

/** Integer string in token atoms (or lamports). */
export const titanAtomAmountSchema = z.string().regex(/^\d+$/);

/** Nullable atom amount. */
export const titanAtomAmountNullableSchema = titanAtomAmountSchema.nullable();

/** ISO-8601 timestamp string. */
export const titanIsoTimestampSchema = z.string().min(1);

/** Nullable ISO timestamp. */
export const titanIsoTimestampNullableSchema = titanIsoTimestampSchema.nullable();

/**
 * Order lifecycle status.
 * DCA may use `pending` / `pending_modification`; triggers do not.
 * Slice Orders use only `active` | `executing` | `completed` | `failed`.
 */
export const titanOrderStatusSchema = z.enum([
  "pending",
  "active",
  "executing",
  "pending_modification",
  "paused",
  "completed",
  "cancelled",
  "failed",
  "expired",
]);

/**
 * Inferred order status.
 */
export type TitanOrderStatus = z.infer<typeof titanOrderStatusSchema>;

/**
 * Withdrawal lifecycle — independent of `status`.
 */
export const titanWithdrawalStatusSchema = z.enum(["none", "pending", "completed"]);

/**
 * Inferred withdrawal status.
 */
export type TitanWithdrawalStatus = z.infer<typeof titanWithdrawalStatusSchema>;

/**
 * Price denomination for trigger orders.
 */
export const titanPriceBasisSchema = z.enum(["pair", "usd"]);

/**
 * Inferred price basis.
 */
export type TitanPriceBasis = z.infer<typeof titanPriceBasisSchema>;

/**
 * Trailing mode label on stop-loss (UI-only; does not affect execution).
 */
export const titanTrailingModeSchema = z.enum(["pure", "stop_and_trail"]);

/**
 * Partner attribution on user-scoped reads (omitted on `/partners/me/*`).
 */
export const titanOriginatingPartnerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

/**
 * Shared Order base returned by confirm, lists, and per-type detail.
 * DCA cycle fields are present on DCA rows; triggers replace them with trigger fields.
 */
export const titanOrderBaseSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  originatingPartner: titanOriginatingPartnerSchema.optional(),
  userId: z.string().min(1),
  walletAddress: z.string().min(1),
  outputRecipientAddress: z.string().min(1),
  orderType: titanOrderTypeSchema,
  status: titanOrderStatusSchema,
  previousStatus: titanOrderStatusSchema.nullable().optional(),
  inputMint: z.string().min(1),
  outputMint: z.string().min(1),
  totalAmount: titanAtomAmountSchema.optional(),
  amountSpent: titanAtomAmountSchema.optional(),
  amountReceived: titanAtomAmountSchema.nullable().optional(),
  startAt: titanIsoTimestampNullableSchema.optional(),
  expiresAt: titanIsoTimestampNullableSchema.optional(),
  nextExecutionAt: titanIsoTimestampNullableSchema.optional(),
  lastExecutionAt: titanIsoTimestampNullableSchema.optional(),
  lastExecutionTxHash: z.string().nullable().optional(),
  createdAt: titanIsoTimestampSchema,
  updatedAt: titanIsoTimestampSchema,
  cancelledAt: titanIsoTimestampNullableSchema.optional(),
  completedAt: titanIsoTimestampNullableSchema.optional(),
  failedAt: titanIsoTimestampNullableSchema.optional(),
  failureReason: z.string().nullable().optional(),
  withdrawalStatus: titanWithdrawalStatusSchema,
  withdrawalTxHash: z.string().nullable().optional(),
  withdrawalRequestedAt: titanIsoTimestampNullableSchema.optional(),
  withdrawalCompletedAt: titanIsoTimestampNullableSchema.optional(),
  platformFeeBpsOverride: z.number().int().min(0).max(10_000).nullable().optional(),
});

/**
 * DCA cycle progress fields layered on the base Order.
 */
export const titanDcaOrderFieldsSchema = z.object({
  amountPerCycle: titanAtomAmountSchema,
  cycleFrequencySeconds: z.number().int().positive(),
  minOutputPerCycle: titanAtomAmountNullableSchema.optional(),
  maxOutputPerCycle: titanAtomAmountNullableSchema.optional(),
  cyclesCompleted: z.number().int().min(0),
  totalCycles: z.number().int().positive(),
});

/**
 * Trigger / OCO / take-profit fields. Prefer `currentTriggerPrice` over frozen `triggerPrice`.
 */
export const titanTriggerOrderFieldsSchema = z.object({
  amount: titanAtomAmountSchema.optional(),
  triggerPrice: z.string().regex(/^\d+$/).optional(),
  takeProfitPrice: z.string().regex(/^\d+$/).optional(),
  stopLossPrice: z.string().regex(/^\d+$/).optional(),
  priceDecimals: z.number().int().min(0).max(18).optional(),
  priceBasis: titanPriceBasisSchema.optional(),
  minOutputAmount: titanAtomAmountSchema.optional(),
  executedPrice: z.string().regex(/^\d+$/).nullable().optional(),
  executedPriceDecimals: z.number().int().min(0).max(18).optional(),
  trailingStopBps: z.number().int().min(1).max(9999).optional(),
  currentTriggerPrice: z.string().regex(/^\d+$/).optional(),
  highestObservedPrice: z.string().regex(/^\d+$/).optional(),
  trailingActivated: z.boolean().optional(),
  trailingMode: titanTrailingModeSchema.optional(),
  pendingLeg: z.enum(["stop_loss", "take_profit"]).optional(),
  amountRemaining: titanAtomAmountSchema.optional(),
  scaleStepsExecuted: z.number().int().min(0).optional(),
  onFillOco: z.unknown().optional(),
  childOrderId: z.string().min(1).optional(),
  onFillError: z.literal("amount_unverified").optional(),
  parentOrderId: z.string().min(1).optional(),
});

/**
 * Slice-order extras on the base Order (lists omit `chunks`).
 */
export const titanSliceOrderFieldsSchema = z.object({
  executionsTotal: z.number().int().positive().optional(),
  minGapSeconds: z.number().int().min(0).optional(),
  onFillOco: z.unknown().optional(),
  childOrderId: z.string().min(1).optional(),
  onFillError: z.literal("amount_unverified").optional(),
});

/**
 * Full Order row as returned by confirm / list / detail.
 * Type-specific fields are optional so one schema covers all five types.
 */
export const titanOrderSchema = titanOrderBaseSchema
  .merge(titanDcaOrderFieldsSchema.partial())
  .merge(titanTriggerOrderFieldsSchema)
  .merge(titanSliceOrderFieldsSchema);

/**
 * Inferred Order.
 */
export type TitanOrder = z.infer<typeof titanOrderSchema>;

/**
 * One confirmed Slice Order chunk (`GET /slice/{orderId}` → `data.chunks[]`).
 */
export const titanSliceChunkSchema = z.object({
  index: z.number().int().positive(),
  inputAmount: titanAtomAmountSchema,
  outputAmount: titanAtomAmountSchema,
  txSignature: z.string().min(1),
  executedAt: titanIsoTimestampSchema,
});

/**
 * Inferred slice chunk.
 */
export type TitanSliceChunk = z.infer<typeof titanSliceChunkSchema>;

/**
 * Slice detail payload: `{ order, chunks }`.
 */
export const titanSliceDetailSchema = z.object({
  order: titanOrderSchema,
  chunks: z.array(titanSliceChunkSchema),
});

/**
 * Inferred slice detail.
 */
export type TitanSliceDetail = z.infer<typeof titanSliceDetailSchema>;

/**
 * Execution type for fill history rows.
 */
export const titanExecutionTypeSchema = z.enum([
  "dca_cycle",
  "stop_loss",
  "take_profit_full",
  "take_profit_scaled",
  "slice_fill",
]);

/**
 * Inferred execution type.
 */
export type TitanExecutionType = z.infer<typeof titanExecutionTypeSchema>;

/**
 * Per-execution status.
 */
export const titanExecutionStatusSchema = z.enum(["pending", "success", "failed"]);

/**
 * Inferred execution status.
 */
export type TitanExecutionStatus = z.infer<typeof titanExecutionStatusSchema>;

/**
 * One Execution row from `/orders/{id}/executions` or partner reporting.
 * `platformFee*` fields are all populated together or all null.
 */
export const titanExecutionSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  executionType: titanExecutionTypeSchema,
  status: titanExecutionStatusSchema,
  inputAmount: titanAtomAmountSchema,
  outputAmount: titanAtomAmountSchema,
  outputAmountUsd: titanAtomAmountSchema.nullable().optional(),
  outputAmountUsdDecimals: z.number().int().min(0).max(18).nullable().optional(),
  price: z.string().regex(/^\d+$/),
  priceDecimals: z.number().int().min(0).max(18),
  txSignature: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  executedAt: titanIsoTimestampSchema,
  executionIndex: z.number().int().positive().optional(),
  platformFeeWallet: z.string().nullable().optional(),
  platformFeeBps: z.number().int().min(0).max(10_000).nullable().optional(),
  platformFeeMint: z.string().nullable().optional(),
  platformFeeAmount: titanAtomAmountSchema.nullable().optional(),
});

/**
 * Inferred Execution.
 */
export type TitanExecution = z.infer<typeof titanExecutionSchema>;

/**
 * Token program id on a balance row.
 */
export const titanBalanceProgramIdSchema = z.enum(["native", "token", "token-2022"]);

/**
 * One lock attribution inside `lockedBreakdown`.
 */
export const titanLockedBreakdownRowSchema = z.object({
  orderId: z.string().min(1),
  orderType: titanOrderTypeSchema,
  status: titanOrderStatusSchema,
  kind: z.string().min(1),
  amount: titanAtomAmountSchema,
});

/**
 * Inferred locked-breakdown row.
 */
export type TitanLockedBreakdownRow = z.infer<typeof titanLockedBreakdownRowSchema>;

/**
 * One balance row from `GET /me/balance` → `data.balances[]`.
 */
export const titanBalanceRowSchema = z.object({
  mint: z.string().min(1),
  symbol: z.string().nullable().optional(),
  decimals: z.number().int().min(0).max(18),
  programId: titanBalanceProgramIdSchema,
  totalBalance: titanAtomAmountSchema,
  lockedForFutureTxns: titanAtomAmountSchema,
  withdrawalPending: titanAtomAmountSchema,
  availableToWithdraw: titanAtomAmountSchema,
  lockedBreakdown: z.array(titanLockedBreakdownRowSchema).optional(),
});

/**
 * Inferred balance row.
 */
export type TitanBalanceRow = z.infer<typeof titanBalanceRowSchema>;

/**
 * Full `GET /me/balance` data object.
 */
export const titanMeBalanceSchema = z.object({
  walletAddress: z.string().min(1),
  balances: z.array(titanBalanceRowSchema),
});

/**
 * Inferred me-balance payload.
 */
export type TitanMeBalance = z.infer<typeof titanMeBalanceSchema>;

/**
 * Formats an atom amount string with a fixed decimal scale (no float math).
 *
 * @param units - Integer string of smallest units.
 * @param decimals - Mint or price decimal scale.
 * @returns Decimal display string.
 */
export function formatAtomAmount(units: string, decimals: number): string {
  const normalized = units.replace(/^0+(?=\d)/, "") || "0";
  if (decimals === 0) return normalized;
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, "") || "0";
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * Formats a fixed-point price string using `priceDecimals`.
 *
 * @param price - Integer string scaled by `priceDecimals`.
 * @param priceDecimals - Scale (0–18).
 * @returns Display string such as `0.5`.
 */
export function formatFixedPointPrice(price: string, priceDecimals: number): string {
  return formatAtomAmount(price, priceDecimals);
}

/**
 * Live trigger to render for stop-loss / OCO (prefer server `currentTriggerPrice`).
 *
 * @param order - Order row that may carry trigger fields.
 * @returns Fixed-point integer string, or null when absent.
 */
export function liveTriggerPrice(order: TitanOrder): string | null {
  if (order.currentTriggerPrice) return order.currentTriggerPrice;
  if (order.orderType === "oco" && order.stopLossPrice) return order.stopLossPrice;
  if (order.triggerPrice) return order.triggerPrice;
  return null;
}

/**
 * Parses a confirmed order payload leniently for desk display.
 * Extra undocumented fields are stripped by Zod object defaults (passthrough off).
 *
 * @param value - Raw `order` object from Titan.
 * @returns Parsed order, or null when required base fields are missing.
 */
export function parseTitanOrder(value: unknown): TitanOrder | null {
  const parsed = titanOrderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
