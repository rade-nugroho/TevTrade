import type {
  config as WormholeConfigNs,
  WormholeConnectTheme,
} from "@wormhole-foundation/wormhole-connect";
import { z } from "zod";
import {
  resolveWormholeNetwork,
  type WormholeNetwork,
} from "./wormhole-network";

/**
 * Optional RPC URL map for Connect (public keys only — no secrets in NEXT_PUBLIC_*).
 */
export const wormholeRpcEnvSchema = z.object({
  solana: z.string().url().optional(),
  ethereum: z.string().url().optional(),
  base: z.string().url().optional(),
  arbitrum: z.string().url().optional(),
});

/**
 * Inferred optional RPC overrides from env.
 */
export type WormholeRpcEnv = z.infer<typeof wormholeRpcEnvSchema>;

/**
 * Reads optional Connect RPC overrides from the public env.
 * Prefer dedicated Wormhole RPCs; Solana can fall back to the desk browser RPC.
 *
 * @returns Partial RPC map for Connect `rpcs`.
 */
export function readWormholeRpcEnv(): WormholeRpcEnv {
  return wormholeRpcEnvSchema.parse({
    solana:
      process.env.NEXT_PUBLIC_WORMHOLE_RPC_SOLANA ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      undefined,
    ethereum: process.env.NEXT_PUBLIC_WORMHOLE_RPC_ETHEREUM || undefined,
    base: process.env.NEXT_PUBLIC_WORMHOLE_RPC_BASE || undefined,
    arbitrum: process.env.NEXT_PUBLIC_WORMHOLE_RPC_ARBITRUM || undefined,
  });
}

/**
 * Builds Connect `rpcs` for the active Wormhole network.
 *
 * @param network - Mainnet or Testnet.
 * @returns Chain → RPC URL map (only keys with a configured URL).
 */
export function buildWormholeRpcs(
  network: WormholeNetwork,
): NonNullable<WormholeConfigNs.WormholeConnectConfig["rpcs"]> {
  const env = readWormholeRpcEnv();
  const rpcs: NonNullable<WormholeConfigNs.WormholeConnectConfig["rpcs"]> = {};

  if (env.solana) {
    rpcs.Solana = env.solana;
  }

  if (network === "Mainnet") {
    if (env.ethereum) rpcs.Ethereum = env.ethereum;
    if (env.base) rpcs.Base = env.base;
    if (env.arbitrum) rpcs.Arbitrum = env.arbitrum;
  } else {
    if (env.ethereum) rpcs.Sepolia = env.ethereum;
    if (env.base) rpcs.BaseSepolia = env.base;
    if (env.arbitrum) rpcs.ArbitrumSepolia = env.arbitrum;
  }

  return rpcs;
}

/**
 * Chains offered on Mainnet: Solana ↔ major EVM for USDC/SOL-style transfers.
 */
const MAINNET_CHAINS = ["Solana", "Ethereum", "Base", "Arbitrum"] as const;

/**
 * Chains offered on Testnet (Connect testnet names).
 */
const TESTNET_CHAINS = ["Solana", "Sepolia", "BaseSepolia", "ArbitrumSepolia"] as const;

/**
 * Token whitelist focused on native gas + USDC (CCTP / WTT).
 */
const MAINNET_TOKENS = ["SOL", "ETH", "USDC", "USDCeth", "USDCbase", "USDCarb"] as const;

/**
 * Builds a quiet personal-desk Wormhole Connect config.
 * Uses default WTT + CCTP routes (no custom NTT deploy).
 * Connect prompts for wallet approve/sign — TevTrade never loads `id.json`.
 *
 * @returns Connect config, or null when the desk cluster cannot use Wormhole.
 */
export function buildWormholeConnectConfig(): WormholeConfigNs.WormholeConnectConfig | null {
  const network = resolveWormholeNetwork();
  if (!network) return null;

  const chains = network === "Mainnet" ? [...MAINNET_CHAINS] : [...TESTNET_CHAINS];
  const rpcs = buildWormholeRpcs(network);
  const walletConnectProjectId =
    process.env.NEXT_PUBLIC_WORMHOLE_WALLETCONNECT_PROJECT_ID?.trim() || undefined;
  const destinationChain = network === "Mainnet" ? "Ethereum" : "Sepolia";

  const config: WormholeConfigNs.WormholeConnectConfig = {
    network,
    chains,
    rpcs: Object.keys(rpcs).length > 0 ? rpcs : undefined,
    ui: {
      title: "Bridge",
      defaultInputs: {
        source: { chain: "Solana" },
        destination: { chain: destinationChain },
      },
      showFooter: false,
      hideHistory: false,
      walletConnectProjectId,
    },
  };

  if (network === "Mainnet") {
    config.tokens = [...MAINNET_TOKENS];
  }

  return config;
}

/**
 * TevTrade-neutral Connect theme (no SaaS purple chrome).
 *
 * @param mode - Light or dark to match the desk.
 * @returns Connect theme object.
 */
export function buildWormholeConnectTheme(
  mode: "light" | "dark" = "light",
): WormholeConnectTheme {
  if (mode === "dark") {
    return {
      mode: "dark",
      primary: "#e5e5e5",
      secondary: "#a3a3a3",
      text: "#fafafa",
      textSecondary: "#a3a3a3",
      error: "#f87171",
      success: "#4ade80",
      font: "ui-sans-serif, system-ui, sans-serif",
      background: "#0a0a0a",
      formBackground: "#171717",
      input: "#262626",
    };
  }

  return {
    mode: "light",
    primary: "#171717",
    secondary: "#737373",
    text: "#171717",
    textSecondary: "#737373",
    error: "#dc2626",
    success: "#16a34a",
    font: "ui-sans-serif, system-ui, sans-serif",
    background: "#ffffff",
    formBackground: "#fafafa",
    input: "#f5f5f5",
  };
}
