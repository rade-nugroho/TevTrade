import { decisionEventSchema, decisionRequestSchema, type DecisionEvent } from "@/lib/decision-schema";
import { readServerEnv } from "@/lib/env";
import { readWalletBalance } from "@/lib/helius";
import { streamOllamaDecision } from "@/lib/ollama";
import { readDecisionFacts } from "@/lib/typedb";

export const dynamic = "force-dynamic";

/**
 * Streams a local decision.
 * TypeDB supplies the rule book, Helius supplies the wallet balance, and the model returns one option letter.
 * When no Wallet Standard address is sent, the server may use public `DESK_WALLET_ADDRESS` for balance only.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = decisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Request body is invalid." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DecisionEvent) => {
        decisionEventSchema.parse(event);
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const timeout = AbortSignal.timeout(120_000);
      const signal = AbortSignal.any([request.signal, timeout]);
      const connectedAddress = parsed.data.walletAddress;
      const deskAddress = readServerEnv().deskWalletAddress;
      const balanceAddress = connectedAddress ?? deskAddress;
      const walletSource = connectedAddress ? "connected" : "desk";

      try {
        const [facts, chain] = await Promise.all([
          readDecisionFacts(),
          readWalletBalance(balanceAddress, walletSource),
        ]);
        send({
          type: "context",
          summary: `${facts.summary}\n${chain.summary}`,
        });
        await streamOllamaDecision({
          messages: parsed.data.messages,
          facts: facts.summary,
          chain: chain.summary,
          signal,
          onToken: (text) => send({ type: "token", text }),
        });
        send({ type: "done" });
      } catch (error) {
        if (request.signal.aborted) return;
        const message = error instanceof Error ? error.message : "The decision model failed.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
