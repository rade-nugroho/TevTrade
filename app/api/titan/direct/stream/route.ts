import {
  readDirectError,
  streamDirectQuotes,
  titanDirectStreamRequestSchema,
} from "@/lib/titan-direct";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies a Titan Direct quote stream as NDJSON.
 * Stops on client disconnect and caps duration at ~30 seconds.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON stream request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanDirectStreamRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Check mints, amount, decimals, and userPublicKey.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  if (parsed.data.inputMint === parsed.data.outputMint) {
    return Response.json({ error: "Choose two different tokens.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  void (async () => {
    try {
      await streamDirectQuotes(parsed.data, writer, request.signal);
    } catch (error) {
      const mapped = readDirectError(error);
      const encoder = new TextEncoder();
      try {
        await writer.write(
          encoder.encode(`${JSON.stringify({ type: "error", error: mapped.message, code: mapped.code })}\n`),
        );
      } catch {
        // The client may already be gone.
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed.
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
