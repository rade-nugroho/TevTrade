import { requestDirectSwapPrice, readDirectError, titanDirectPriceRequestSchema } from "@/lib/titan-direct";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies a one-shot Titan Direct `getSwapPrice` call.
 * The JWT stays on the server.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON price request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanDirectPriceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check mints, amount, and decimals.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (parsed.data.inputMint === parsed.data.outputMint) {
    return Response.json({ error: "Choose two different tokens.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const price = await requestDirectSwapPrice(parsed.data);
    return Response.json(price);
  } catch (error) {
    const mapped = readDirectError(error);
    return Response.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
  }
}
