import { createOrderIntent, partnerErrorResponse } from "@/lib/titan-dca";
import { titanOrderIntentRequestSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies `POST /orders/intent` with X-Titan-Key and X-Titan-User.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON intent request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanOrderIntentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check orderType, userPubkey, config, and idempotencyKey.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await createOrderIntent(parsed.data, request.signal);
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
