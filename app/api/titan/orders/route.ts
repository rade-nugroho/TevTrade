import { listOrders, partnerErrorResponse } from "@/lib/titan-dca";
import { titanSubSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies user order list. Prefer `GET /api/titan/me/orders` — same Titan path.
 * Query: `sub`, optional `status`, `type`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = titanSubSchema.safeParse(url.searchParams.get("sub"));
  if (!parsed.success) {
    return Response.json({ error: "Pass a valid sub query parameter.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await listOrders(
      parsed.data,
      {
        status: url.searchParams.get("status") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
      },
      request.signal,
    );
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
