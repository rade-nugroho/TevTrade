import "server-only";

import { z } from "zod";
import { readServerEnv } from "./env";
import { formatSol } from "./solana-cluster";

const PUBLIC_DEVNET_RPC_URL = "https://api.devnet.solana.com";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const balanceResponseSchema = z.object({
  result: z
    .object({
      value: z.number().int().nonnegative(),
    })
    .optional(),
  error: z
    .object({
      message: z.string(),
    })
    .optional(),
});

/**
 * Which RPC the server will call. The API key never leaves this module.
 */
export type RpcProvider = "helius" | "public-devnet";

/**
 * Chain note passed to the local decision model.
 */
export type ChainNote = {
  readonly status: "ok" | "no-wallet" | "invalid" | "error";
  readonly provider: RpcProvider;
  readonly summary: string;
};

/**
 * Builds the upstream Solana RPC URL.
 * A Helius URL without `api-key` receives `HELIUS_API_KEY`.
 * An empty Helius URL falls back to public devnet.
 */
export function resolveSolanaRpcUrl(): { url: string; provider: RpcProvider } {
  const { heliusUrl, heliusApiKey } = readServerEnv();
  if (!heliusUrl) {
    return { url: PUBLIC_DEVNET_RPC_URL, provider: "public-devnet" };
  }
  const base = heliusUrl.replace(/\/$/, "");
  if (!heliusApiKey || /[?&]api-key=/.test(base)) {
    return { url: base, provider: "helius" };
  }
  const joiner = base.includes("?") ? "&" : "?";
  return {
    url: `${base}${joiner}api-key=${encodeURIComponent(heliusApiKey)}`,
    provider: "helius",
  };
}

/**
 * Reads a confirmed SOL balance for a wallet address.
 * On-chain data is treated as untrusted and reduced to a number.
 */
export async function readWalletBalance(address: string | undefined): Promise<ChainNote> {
  const { provider } = resolveSolanaRpcUrl();
  const source = provider === "helius" ? "Helius" : "public devnet RPC";

  if (!address) {
    return {
      status: "no-wallet",
      provider,
      summary: `No wallet is connected. Balance lookups use ${source}.`,
    };
  }
  if (!ADDRESS_PATTERN.test(address)) {
    return {
      status: "invalid",
      provider,
      summary: "The wallet address was rejected before the RPC call.",
    };
  }

  try {
    const { url } = resolveSolanaRpcUrl();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [address, { commitment: "confirmed" }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const parsed = balanceResponseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.error || parsed.data.result === undefined) {
      const message = parsed.success ? parsed.data.error?.message : undefined;
      return {
        status: "error",
        provider,
        summary: message
          ? `${source} rejected the balance request.`
          : `${source} returned an unreadable balance.`,
      };
    }
    return {
      status: "ok",
      provider,
      summary: `${source} reports ${formatSol(BigInt(parsed.data.result.value))} for the connected wallet.`,
    };
  } catch {
    return {
      status: "error",
      provider,
      summary: `${source} did not respond to the balance request.`,
    };
  }
}
