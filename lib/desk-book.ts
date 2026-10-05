import {
  formatAtomAmount,
  liveTriggerPrice,
  titanExecutionSchema,
  titanMeBalanceResultSchema,
  titanOrderId,
  titanOrdersListResultSchema,
  type TitanExecution,
  type TitanMeBalanceResult,
  type TitanOrder,
  type TitanOrdersListResult,
} from "@/lib/titan-dca-public";
import { mintLabel, resolveMintDecimals } from "@/lib/titan-public";

/**
 * Partner book fetch outcome for Desk / Analytics.
 */
export type DeskBookStatus = "idle" | "loading" | "ready" | "empty" | "unconfigured" | "error";

/**
 * Trading rule row returned by `GET /api/desk/rules` (mirrors TypeDB, client-safe).
 */
export type DeskTradingRule = {
  readonly topic: string;
  readonly stance: string;
  readonly rationale: string;
};

/**
 * Rule-book payload for Analytics.
 */
export type DeskRulesResult = {
  readonly status: "ok" | "unconfigured" | "empty" | "error";
  readonly summary: string;
  readonly rules: readonly DeskTradingRule[];
};

/**
 * Flattened fill row from `/orders/{id}/executions`, or order-level spent/received fallback.
 */
export type DeskFill = {
  readonly key: string;
  readonly orderId: string;
  readonly orderType: string;
  readonly executionType?: string;
  readonly status?: string;
  readonly amountSpent?: string;
  readonly amountReceived?: string | null;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly txSignature?: string | null;
  readonly executedAt?: string | null;
  readonly price?: string;
  readonly priceDecimals?: number;
};

/**
 * API error shape returned by Titan partner proxies.
 */
type PartnerErrorBody = {
  readonly error?: string;
  readonly code?: string;
};

/**
 * Loads partner orders for a Titan sub (`GET /api/titan/me/orders`).
 */
export async function fetchDeskOrders(sub: string, signal?: AbortSignal): Promise<{
  readonly status: DeskBookStatus;
  readonly orders: readonly TitanOrder[];
  readonly message?: string;
}> {
  const response = await fetch(`/api/titan/me/orders?sub=${encodeURIComponent(sub)}`, {
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as TitanOrdersListResult | PartnerErrorBody;
  if (response.status === 503 || ("code" in payload && payload.code === "NOT_CONFIGURED")) {
    return {
      status: "unconfigured",
      orders: [],
      message:
        "error" in payload && payload.error
          ? payload.error
          : "Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY to load partner orders.",
    };
  }
  if (!response.ok) {
    return {
      status: "error",
      orders: [],
      message: "error" in payload && payload.error ? payload.error : "Orders list failed.",
    };
  }
  const parsed = titanOrdersListResultSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: "error",
      orders: [],
      message: "Orders response did not match the Order & Execution Schema.",
    };
  }
  if (parsed.data.orders.length === 0) {
    return { status: "empty", orders: [] };
  }
  return { status: "ready", orders: parsed.data.orders };
}

/**
 * Loads partner withdrawable balances for a Titan sub.
 */
export async function fetchDeskBalance(sub: string, signal?: AbortSignal): Promise<{
  readonly status: DeskBookStatus;
  readonly balance: TitanMeBalanceResult | null;
  readonly message?: string;
}> {
  const response = await fetch(`/api/titan/me/balance?sub=${encodeURIComponent(sub)}`, {
    signal,
    cache: "no-store",
  });
  const payload = (await response.json()) as TitanMeBalanceResult | PartnerErrorBody;
  if (response.status === 503 || ("code" in payload && payload.code === "NOT_CONFIGURED")) {
    return {
      status: "unconfigured",
      balance: null,
      message:
        "error" in payload && payload.error
          ? payload.error
          : "Set TITAN_DCA_BASE_URL and TITAN_DCA_API_KEY to load partner balances.",
    };
  }
  if (!response.ok) {
    return {
      status: "error",
      balance: null,
      message: "error" in payload && payload.error ? payload.error : "Balance lookup failed.",
    };
  }
  const parsed = titanMeBalanceResultSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: "error",
      balance: null,
      message: "Balance response did not match the Order & Execution Schema.",
    };
  }
  if (parsed.data.balances.length === 0) {
    return { status: "empty", balance: parsed.data };
  }
  return { status: "ready", balance: parsed.data };
}

/**
 * Loads executions for one order (`GET /api/titan/orders/:id/executions`).
 */
export async function fetchOrderExecutions(
  sub: string,
  orderId: string,
  signal?: AbortSignal,
): Promise<readonly TitanExecution[]> {
  const response = await fetch(
    `/api/titan/orders/${encodeURIComponent(orderId)}/executions?sub=${encodeURIComponent(sub)}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    const parsed = titanExecutionSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Loads fills for many orders (bounded concurrency). Falls back to order totals when empty.
 */
export async function fetchDeskFills(
  sub: string,
  orders: readonly TitanOrder[],
  signal?: AbortSignal,
): Promise<readonly DeskFill[]> {
  const batches = await Promise.all(
    orders.map(async (order) => {
      const executions = await fetchOrderExecutions(sub, order.id, signal);
      if (executions.length > 0) {
        return executions.map((execution) => executionToFill(order, execution));
      }
      if (order.amountSpent !== undefined || order.amountReceived != null) {
        return [orderTotalsFill(order)];
      }
      return [] as DeskFill[];
    }),
  );
  return batches.flat();
}

/**
 * Sync fill rows from order totals when executions are not loaded yet.
 * Prefer `fetchDeskFills` when the desk can call the executions proxy.
 */
export function collectDeskFills(orders: readonly TitanOrder[]): readonly DeskFill[] {
  return orders.flatMap((order) => {
    if (order.amountSpent !== undefined || order.amountReceived != null) {
      return [orderTotalsFill(order)];
    }
    return [];
  });
}

/**
 * Formats an order/mint atom amount when decimals are known.
 */
export function formatOrderAmount(units: string | null | undefined, mint: string): string {
  if (units == null) return "—";
  const scale = resolveMintDecimals(mint, undefined);
  if (scale === null) return units;
  const label = mintLabel(mint);
  const display = formatAtomAmount(units, scale);
  return label === "—" ? display : `${display} ${label}`;
}

/**
 * Formats DCA cycle progress when present.
 */
export function formatCycles(order: TitanOrder): string | null {
  if (order.orderType !== "dca") return null;
  if (order.cyclesCompleted === undefined || order.totalCycles === undefined) return null;
  return `${order.cyclesCompleted} / ${order.totalCycles}`;
}

/**
 * Formats live trigger price with priceDecimals when available.
 */
export function formatTrigger(order: TitanOrder): string | null {
  const price = liveTriggerPrice(order);
  if (!price) return null;
  const decimals = order.priceDecimals;
  if (typeof decimals === "number") {
    return formatAtomAmount(price, decimals);
  }
  return price;
}

/**
 * Short spent → received line for a fill or order.
 */
export function formatSpendReceive(row: {
  readonly amountSpent?: string | null;
  readonly amountReceived?: string | null;
  readonly inputMint: string;
  readonly outputMint: string;
}): string {
  const spent = formatOrderAmount(row.amountSpent ?? undefined, row.inputMint);
  const received = formatOrderAmount(row.amountReceived ?? undefined, row.outputMint);
  if (spent === "—" && received === "—") return "—";
  return `${spent} → ${received}`;
}

/**
 * Session counters derived only from real order rows (no fake revenue).
 */
export function summarizeSession(orders: readonly TitanOrder[]): {
  readonly total: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byType: Readonly<Record<string, number>>;
  readonly dcaWithCycles: number;
  readonly trailingWithTrigger: number;
} {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let dcaWithCycles = 0;
  let trailingWithTrigger = 0;

  for (const order of orders) {
    byStatus[order.status] = (byStatus[order.status] ?? 0) + 1;
    byType[order.orderType] = (byType[order.orderType] ?? 0) + 1;
    if (formatCycles(order)) dcaWithCycles += 1;
    if (order.currentTriggerPrice || order.trailingStopBps) trailingWithTrigger += 1;
  }

  return {
    total: orders.length,
    byStatus,
    byType,
    dcaWithCycles,
    trailingWithTrigger,
  };
}

/**
 * Formats balance lines emphasizing availableToWithdraw.
 */
export function formatBalanceLines(balance: TitanMeBalanceResult): readonly {
  readonly key: string;
  readonly available: string;
  readonly total: string;
  readonly locked: string;
  readonly pending: string;
}[] {
  return balance.balances.map((row) => {
    const symbol = row.symbol?.trim() || mintLabel(row.mint);
    const tag = symbol === "—" ? "" : ` ${symbol}`;
    return {
      key: `${row.mint}:${row.programId}`,
      available: `${formatAtomAmount(row.availableToWithdraw, row.decimals)}${tag}`,
      total: `${formatAtomAmount(row.totalBalance, row.decimals)}${tag}`,
      locked: `${formatAtomAmount(row.lockedForFutureTxns, row.decimals)}${tag}`,
      pending: `${formatAtomAmount(row.withdrawalPending, row.decimals)}${tag}`,
    };
  });
}

/**
 * Maps one execution onto a desk fill row using the parent order mints.
 */
function executionToFill(order: TitanOrder, execution: TitanExecution): DeskFill {
  return {
    key: execution.id,
    orderId: order.id,
    orderType: order.orderType,
    executionType: execution.executionType,
    status: execution.status,
    amountSpent: execution.inputAmount,
    amountReceived: execution.outputAmount,
    inputMint: order.inputMint,
    outputMint: order.outputMint,
    txSignature: execution.txSignature,
    executedAt: execution.executedAt,
    price: execution.price,
    priceDecimals: execution.priceDecimals,
  };
}

/**
 * Order-level spent/received when the executions list is empty or unavailable.
 */
function orderTotalsFill(order: TitanOrder): DeskFill {
  return {
    key: `${titanOrderId(order)}:totals`,
    orderId: order.id,
    orderType: order.orderType,
    amountSpent: order.amountSpent,
    amountReceived: order.amountReceived,
    inputMint: order.inputMint,
    outputMint: order.outputMint,
    txSignature: order.lastExecutionTxHash,
    executedAt: order.lastExecutionAt,
  };
}
