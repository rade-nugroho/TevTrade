import { NextResponse } from "next/server";
import { listTradingRules } from "@/lib/typedb";

export const dynamic = "force-dynamic";

/**
 * Returns the TypeDB trading-rule book for Analytics.
 * Secrets stay on the server; only topic / stance / rationale are returned.
 */
export async function GET() {
  const result = await listTradingRules();
  return NextResponse.json(result);
}
