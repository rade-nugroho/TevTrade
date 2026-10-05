import { requestTitanQuote, titanQuoteRequestSchema } from "@/lib/titan";

export const dynamic = "force-dynamic";

/**
 * Proxies a Titan swap quote.
 * Defaults to public DART (`api.titan.exchange/dart`). Set `TITAN_QUOTE_SOURCE=portal`
 * for Developers Portal. Secrets stay on the server. Instruction bytes are
 * stripped unless the request sets `includeInstructions` (DART only).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON quote request." }, { status: 400 });
  }

  const parsed = titanQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the mints, amount, and wallet address." }, { status: 400 });
  }
  if (parsed.data.inputMint === parsed.data.outputMint) {
    return Response.json({ error: "Choose two different tokens." }, { status: 400 });
  }

  try {
    const quote = await requestTitanQuote(parsed.data, AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]));
    return Response.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Titan quote failed.";
    const status = message.startsWith("Set TITAN_API_KEY") ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
