import { listMeOrders, partnerErrorResponse } from "@/lib/titan-dca";
import { titanSubSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies `GET /me/orders` with optional `status` and `type` filters.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const subResult = titanSubSchema.safeParse(url.searchParams.get("sub") ?? "");
  if (!subResult.success) {
    return Response.json({ error: "Pass a valid sub query parameter.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const orders = await listMeOrders(
      subResult.data,
      {
        status: url.searchParams.get("status") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
      },
      request.signal,
    );
    return Response.json(orders);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
