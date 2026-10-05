import { z } from "zod";
import { mutateOrderLifecycle, partnerErrorResponse } from "@/lib/titan-dca";
import { titanOrderLifecycleRequestSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
});

/**
 * Proxies partner lifecycle mutations: pause, resume, cancel, withdraw.
 * Body: `{ sub, action, idempotencyKey? }`.
 * When the partner returns an unsigned `transaction`, the desk must Approve
 * before Wallet Standard signs — keys stay on the server.
 */
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "orderId is required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON body required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanOrderLifecycleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Pass sub and action (pause|resume|cancel|withdraw).", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  try {
    const result = await mutateOrderLifecycle(
      parsed.data.sub,
      params.data.orderId,
      parsed.data.action,
      parsed.data.idempotencyKey,
      request.signal,
    );
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
