import { confirmOrder, partnerErrorResponse } from "@/lib/titan-dca";
import { titanOrderConfirmRequestSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies `POST /orders/confirm` with the signed deposit transaction.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON confirm request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanOrderConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Check pendingOrderId, signedTransaction, sub, and idempotencyKey.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmOrder(parsed.data, request.signal);
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
