import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { SOLANA_CHAIN } from "./solana-cluster";

/**
 * RPC URL for the browser client.
 * `NEXT_PUBLIC_SOLANA_RPC_URL` wins. Otherwise the browser uses `/api/rpc`,
 * which forwards to Helius without exposing `HELIUS_API_KEY`.
 */
function browserRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  if (configured) return configured;
  if (typeof window !== "undefined") return `${window.location.origin}/api/rpc`;
  return "https://api.devnet.solana.com";
}

/**
 * Wallet-backed Solana client for the whole app.
 *
 * Signing uses Wallet Standard via `@solana/kit-plugin-wallet` (not the classic
 * Anza `@solana/wallet-adapter-*` React stack). Extensions that implement Wallet
 * Standard (Phantom, Solflare, Backpack, and others) register themselves; the
 * plugin discovers them with `@wallet-standard/app` and filters by
 * {@link SOLANA_CHAIN}. The connected wallet fills the payer and identity roles.
 * Transactions are planned as version 1. Never load `id.json` or other secrets
 * into this browser client.
 */
export const client = createClient()
  .use(walletSigner({ chain: SOLANA_CHAIN }))
  .use(
    solanaRpc({
      rpcUrl: browserRpcUrl(),
      transactionConfig: { version: 1 },
    }),
  );

/**
 * Fully typed client used by `useClient<AppClient>()`.
 */
export type AppClient = Awaited<typeof client>;
