import "server-only";

import { z } from "zod";
import { readServerEnv } from "./env";
import { formatSol, SOLANA_CHAIN } from "./solana-cluster";

const PUBLIC_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const LOCALNET_RPC_URL = "http://127.0.0.1:8899";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const balanceResponseSchema = z.object({
  result: z
    .object({
      value: z.number().nonnegative(),
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
export type RpcProvider = "helius" | "public-devnet" | "localnet";

/**
 * How the decision route obtained the address used for a balance lookup.
 */
export type WalletBalanceSource = "connected" | "desk";

/**
 * Chain note passed to the local decision model.
 */
export type ChainNote = {
  readonly status: "ok" | "no-wallet" | "invalid" | "error";
  readonly provider: RpcProvider;
  readonly summary: string;
};

/**
 * Returns a human label for the active RPC provider.
 */
function providerLabel(provider: RpcProvider): string {
  switch (provider) {
    case "helius":
      return "Helius";
    case "localnet":
      return "local validator";
    default:
      return "public devnet RPC";
  }
}

/**
 * Builds the upstream Solana RPC URL.
 * Localnet never uses Helius — it prefers `NEXT_PUBLIC_SOLANA_RPC_URL`, then `127.0.0.1:8899`.
 * A Helius URL without `api-key` receives `HELIUS_API_KEY`.
 * An empty Helius URL falls back to public devnet.
 */
export function resolveSolanaRpcUrl(): { url: string; provider: RpcProvider } {
  const publicRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (SOLANA_CHAIN === "solana:localnet") {
    return {
      url: publicRpc && publicRpc.length > 0 ? publicRpc : LOCALNET_RPC_URL,
      provider: "localnet",
    };
  }
  if (publicRpc && /127\.0\.0\.1|localhost/.test(publicRpc)) {
    return { url: publicRpc, provider: "localnet" };
  }

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
 * `walletSource` only changes the summary wording; this path never signs.
 */
export async function readWalletBalance(
  address: string | undefined,
  walletSource: WalletBalanceSource = "connected",
): Promise<ChainNote> {
  const { provider } = resolveSolanaRpcUrl();
  const source = providerLabel(provider);
  const walletLabel = walletSource === "desk" ? "desk wallet" : "connected wallet";

  if (!address) {
    return {
      status: "no-wallet",
      provider,
      summary: `No wallet is connected and DESK_WALLET_ADDRESS is unset. Balance lookups use ${source}. Connect a Wallet Standard extension, or set DESK_WALLET_ADDRESS to a public address only.`,
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
      summary: `${source} reports ${formatSol(BigInt(Math.trunc(parsed.data.result.value)))} for the ${walletLabel}.`,
    };
  } catch {
    return {
      status: "error",
      provider,
      summary: `${source} did not respond to the balance request.`,
    };
  }
}
