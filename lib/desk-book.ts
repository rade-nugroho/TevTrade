import {
  titanMeBalanceResultSchema,
  titanOrderId,
  titanOrdersListResultSchema,
  type TitanExecution,
  type TitanMeBalanceResult,
  type TitanOrder,
  type TitanOrdersListResult,
} from "@/lib/titan-dca-public";
import { formatTokenAmount, mintLabel } from "@/lib/titan-public";

/**
 * Partner book fetch outcome for Desk / Analytics.
 */
export type DeskBookStatus = "idle" | "loading" | "ready" | "empty" | "unconfigured" | "error";

/**
 * Flattened fill row derived from order executions (or order totals when executions are absent).
 */
export type DeskFill = {
  readonly key: string;
  readonly orderId: string;
  readonly orderType: string;
  readonly amountSpent?: string;
  readonly amountReceived?: string;
  readonly inputMint?: string;
  readonly outputMint?: string;
  readonly inputDecimals?: number;
  readonly outputDecimals?: number;
  readonly txSignature?: string;
  readonly executedAt?: string;
  readonly currentTriggerPrice?: string | number;
};

/**
 * API error shape returned by Titan partner proxies.
 */
type PartnerErrorBody = {
  readonly error?: string;
  readonly code?: string;
};

/**
 * Loads partner orders for a Titan sub.
 */
export async function fetchDeskOrders(sub: string, signal?: AbortSignal): Promise<{
  readonly status: DeskBookStatus;
  readonly orders: readonly TitanOrder[];
  readonly message?: string;
}> {
  const response = await fetch(`/api/titan/orders?sub=${encodeURIComponent(sub)}`, {
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
    return { status: "error", orders: [], message: "Orders response did not match the Order & Execution Schema." };
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
    return { status: "error", balance: null, message: "Balance response did not match the Order & Execution Schema." };
  }
  const hasRoot = parsed.data.availableToWithdraw !== undefined;
  const hasLines = (parsed.data.balances?.length ?? 0) > 0;
  if (!hasRoot && !hasLines) {
    return { status: "empty", balance: parsed.data };
  }
  return { status: "ready", balance: parsed.data };
}

/**
 * Collects fills from order executions, falling back to order-level spent/received when needed.
 */
export function collectDeskFills(orders: readonly TitanOrder[]): readonly DeskFill[] {
  const fills: DeskFill[] = [];
  for (const order of orders) {
    const orderId = titanOrderId(order);
    const executions = order.executions ?? [];
    if (executions.length > 0) {
      executions.forEach((execution, index) => {
        fills.push(executionToFill(order, orderId, execution, index));
      });
      continue;
    }
    if (order.amountSpent !== undefined || order.amountReceived !== undefined) {
      fills.push({
        key: `${orderId}:totals`,
        orderId,
        orderType: String(order.orderType),
        amountSpent: order.amountSpent,
        amountReceived: order.amountReceived,
        inputMint: order.inputMint,
        outputMint: order.outputMint,
        inputDecimals: order.inputDecimals,
        outputDecimals: order.outputDecimals,
        currentTriggerPrice: order.currentTriggerPrice,
      });
    }
  }
  return fills;
}

/**
 * Formats an order amount with mint decimals when known.
 */
export function formatOrderAmount(
  units: string | undefined,
  mint: string | undefined,
  decimals: number | undefined,
): string {
  return formatTokenAmount(units, { mint, decimals });
}

/**
 * Formats DCA cycle progress when present.
 */
export function formatCycles(order: TitanOrder): string | null {
  const completed = order.cyclesCompleted ?? order.cycles;
  if (completed === undefined && order.totalCycles === undefined) return null;
  const done = completed === undefined ? "?" : String(completed);
  const total = order.totalCycles === undefined ? "?" : String(order.totalCycles);
  return `${done} / ${total}`;
}

/**
 * Short spent → received line for a fill or order.
 */
export function formatSpendReceive(row: {
  readonly amountSpent?: string;
  readonly amountReceived?: string;
  readonly inputMint?: string;
  readonly outputMint?: string;
  readonly inputDecimals?: number;
  readonly outputDecimals?: number;
}): string {
  const spent = formatOrderAmount(row.amountSpent, row.inputMint, row.inputDecimals);
  const received = formatOrderAmount(row.amountReceived, row.outputMint, row.outputDecimals);
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
  readonly fillCount: number;
  readonly dcaWithCycles: number;
  readonly trailingWithTrigger: number;
} {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let fillCount = 0;
  let dcaWithCycles = 0;
  let trailingWithTrigger = 0;

  for (const order of orders) {
    const status = order.status || "unknown";
    const type = String(order.orderType || "unknown");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byType[type] = (byType[type] ?? 0) + 1;
    fillCount += order.executions?.length ?? 0;
    if (type === "dca" && formatCycles(order)) dcaWithCycles += 1;
    if (order.currentTriggerPrice !== undefined) trailingWithTrigger += 1;
  }

  return {
    total: orders.length,
    byStatus,
    byType,
    fillCount,
    dcaWithCycles,
    trailingWithTrigger,
  };
}

/**
 * Maps one execution onto a desk fill row.
 */
function executionToFill(
  order: TitanOrder,
  orderId: string,
  execution: TitanExecution,
  index: number,
): DeskFill {
  return {
    key: execution.id ?? `${orderId}:exec:${index}`,
    orderId,
    orderType: String(order.orderType),
    amountSpent: execution.amountSpent ?? order.amountSpent,
    amountReceived: execution.amountReceived ?? order.amountReceived,
    inputMint: execution.inputMint ?? order.inputMint,
    outputMint: execution.outputMint ?? order.outputMint,
    inputDecimals: execution.inputDecimals ?? order.inputDecimals,
    outputDecimals: execution.outputDecimals ?? order.outputDecimals,
    txSignature: execution.txSignature,
    executedAt: execution.executedAt,
    currentTriggerPrice: order.currentTriggerPrice,
  };
}

/**
 * Formats balance lines for withdrawable partner funds.
 */
export function formatBalanceLines(balance: TitanMeBalanceResult): readonly string[] {
  const lines: string[] = [];
  if (balance.availableToWithdraw !== undefined) {
    lines.push(
      formatTokenAmount(balance.availableToWithdraw, {
        mint: balance.mint,
        decimals: balance.decimals,
        symbol: mintLabel(balance.mint) === "—" ? undefined : mintLabel(balance.mint),
      }),
    );
  }
  for (const row of balance.balances ?? []) {
    if (row.availableToWithdraw === undefined) continue;
    lines.push(
      formatTokenAmount(row.availableToWithdraw, {
        mint: row.mint,
        decimals: row.decimals,
        symbol: mintLabel(row.mint) === "—" ? undefined : mintLabel(row.mint),
      }),
    );
  }
  return lines;
}
