import { listOrderExecutions, partnerErrorResponse } from "@/lib/titan-dca";
import { titanSubSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

type RouteContext = {
  readonly params: Promise<{ readonly orderId: string }>;
};

/**
 * Proxies `GET /orders/{orderId}/executions`.
 */
export async function GET(request: Request, context: RouteContext) {
  const { orderId } = await context.params;
  const url = new URL(request.url);
  const subResult = titanSubSchema.safeParse(url.searchParams.get("sub") ?? "");
  if (!subResult.success || !orderId.trim()) {
    return Response.json(
      { error: "Pass a valid sub and orderId.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  try {
    const executions = await listOrderExecutions(subResult.data, orderId.trim(), request.signal);
    return Response.json(executions);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
