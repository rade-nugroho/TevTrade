import { listOrders, partnerErrorResponse } from "@/lib/titan-dca";
import { titanSubSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies `GET /orders` with X-Titan-Key and X-Titan-User.
 * Query: `sub` (wallet pubkey used as Titan identity).
 */
export async function GET(request: Request) {
  const sub = new URL(request.url).searchParams.get("sub");
  const parsed = titanSubSchema.safeParse(sub);
  if (!parsed.success) {
    return Response.json({ error: "Pass a valid sub query parameter.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await listOrders(parsed.data, request.signal);
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
