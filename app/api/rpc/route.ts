import { NextResponse } from "next/server";
import { resolveSolanaRpcUrl } from "@/lib/helius";
import { SOLANA_CHAIN, solanaClusterLabel } from "@/lib/solana-cluster";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Tells the wallet panel which cluster and provider are active.
 * The response omits the RPC URL so the API key stays on the server.
 */
export function GET() {
  const { provider } = resolveSolanaRpcUrl();
  return NextResponse.json({
    cluster: SOLANA_CHAIN,
    clusterLabel: solanaClusterLabel(),
    provider,
  });
}

/**
 * Forwards a Solana JSON-RPC request to Helius, or to public devnet when Helius is unset.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RPC payload is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "RPC payload must be JSON." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || !("method" in payload)) {
    return NextResponse.json({ error: "RPC payload must include a method." }, { status: 400 });
  }

  const { url } = resolveSolanaRpcUrl();
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "The Solana RPC did not respond." }, { status: 502 });
  }
}
