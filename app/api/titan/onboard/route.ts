import { onboardPartnerUser, partnerErrorResponse } from "@/lib/titan-dca";
import { titanOnboardRequestSchema } from "@/lib/titan-dca-public";

export const dynamic = "force-dynamic";

/**
 * Proxies Titan partner SIWS onboard. The API key never leaves the server.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON onboard request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const parsed = titanOnboardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check sub, userPubkey, message, and signature.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await onboardPartnerUser(parsed.data, request.signal);
    return Response.json(result);
  } catch (error) {
    return partnerErrorResponse(error);
  }
}
