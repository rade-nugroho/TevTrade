import { z } from "zod";
import { getOrderDeposit, partnerErrorResponse } from "@/lib/titan-dca";
import { titanSubSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  orderId: z.string().trim().min(1).max(128),
});

/**
 * Proxies `GET /orders/{orderId}/deposit` for deposit verification.
 */
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "orderId is required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const sub = titanSubSchema.safeParse(new URL(request.url).searchParams.get("sub") ?? "");
  if (!sub.success) {
    return Response.json({ error: "Query param sub is required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await getOrderDeposit(sub.data, params.data.orderId, request.signal);
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
