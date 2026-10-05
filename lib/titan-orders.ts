import "server-only";

/**
 * Titan Special Order Types — partner automation API.
 *
 * This module is the desk’s contract map for scheduled/trigger orders.
 * It is **not** DART (`POST /swap` on `https://api.titan.exchange/dart`) and
 * **not** Developers Portal `quote/swap`. Those surfaces price immediate swaps;
 * this surface creates deposit-backed automation (dca, stop_loss, take_profit, oco, slice).
 *
 * ## Envelope
 * - Success: `{ success: true, data }`
 * - Failure: `{ success: false, error: { code, message, details } }`
 * - Exception: `GET /health` (no success envelope)
 *
 * The server client in `lib/titan-dca.ts` unwraps `data` and maps failures to
 * `TitanPartnerApiError`. Proxies never return `X-Titan-Key` to the browser.
 *
 * ## Auth
 * - Partner-only: `X-Titan-Key` (e.g. `POST /partner/onboard`)
 * - User-scoped: `X-Titan-Key` + `X-Titan-User` (sub)
 * Base URL: `TITAN_DCA_BASE_URL` (no trailing slash). Key: `TITAN_DCA_API_KEY`.
 * Do not invent hosts — use the partner environment URL from Titan docs.
 *
 * ## Core create flow (all five order types)
 * 1. `POST /orders/intent` → unsigned deposit tx (base64) + `pendingOrderId`
 *    Show the preview. Never auto-sign.
 * 2. User signs in Wallet Standard only (never `id.json` / seed phrases).
 * 3. `POST /orders/confirm` with `pendingOrderId` + `signedTransaction`
 *
 * ## Other partner paths (proxied or planned)
 * - `POST /partner/onboard` — SIWS link (`/api/titan/onboard`)
 * - `GET /me`, `GET /me/balance` — identity / balances (stub list below)
 * - `GET /orders`, `GET /orders/:id` — list / detail
 * - pause / resume / cancel / withdraw — mutation txs also need explicit approve
 * - `GET /orders/:id/deposit` — deposit lookup (`/api/titan/orders/[orderId]/deposit`)
 *
 * Runtime implementations live in `lib/titan-dca.ts`.
 * Intent/onboard Zod schemas: `lib/titan-dca-public.ts`.
 * Order / Execution / Balance Zod schemas: `lib/titan-order-schema.ts`.
 */

export {
  TitanDcaConfigError,
  TitanPartnerApiError,
  confirmOrder,
  createOrderIntent,
  getMeBalance,
  getOrderDeposit,
  listMeOrders,
  listOrderExecutions,
  listOrders,
  onboardPartnerUser,
  partnerErrorResponse,
  validateSiwsMessage,
} from "@/lib/titan-dca";

/**
 * Relative partner paths used by TevTrade automation.
 * Prefixed with `TITAN_DCA_BASE_URL` on the server only.
 */
export const TITAN_SPECIAL_ORDER_PATHS = {
  health: "/health",
  onboard: "/partner/onboard",
  me: "/me",
  meBalance: "/me/balance",
  ordersIntent: "/orders/intent",
  ordersConfirm: "/orders/confirm",
  ordersList: "/orders",
  orderDetail: (orderId: string) => `/orders/${encodeURIComponent(orderId)}`,
  orderDeposit: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/deposit`,
  orderPause: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/pause`,
  orderResume: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/resume`,
  orderCancel: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/cancel`,
  orderWithdraw: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/withdraw`,
} as const;

/**
 * Paths that are implemented behind Next.js proxies today.
 */
export const TITAN_SPECIAL_ORDER_PROXIED = [
  "POST /api/titan/onboard → POST /partner/onboard",
  "POST /api/titan/orders/intent → POST /orders/intent",
  "POST /api/titan/orders/confirm → POST /orders/confirm",
  "GET /api/titan/me/orders → GET /me/orders",
  "GET /api/titan/orders → GET /me/orders",
  "GET /api/titan/orders/:orderId/deposit → GET /orders/:id/deposit",
  "GET /api/titan/orders/:orderId/executions → GET /orders/:id/executions",
  "GET /api/titan/me/balance → GET /me/balance",
] as const;

/**
 * Paths documented for later desk wiring (no browser proxies yet).
 */
export const TITAN_SPECIAL_ORDER_PLANNED = [
  "GET /health",
  "GET /me",
  "GET /orders/:id",
  "POST /orders/:id/pause",
  "POST /orders/:id/resume",
  "POST /orders/:id/cancel",
  "POST /orders/:id/withdraw",
] as const;
