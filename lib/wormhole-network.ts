import { z } from "zod";
import { SOLANA_CHAIN } from "./solana-cluster";

/**
 * Wormhole Connect network modes. Local Solana validators are not a Wormhole network.
 */
export const wormholeNetworkSchema = z.enum(["Mainnet", "Testnet"]);

/**
 * Inferred Wormhole Connect network.
 */
export type WormholeNetwork = z.infer<typeof wormholeNetworkSchema>;

/**
 * Reads `NEXT_PUBLIC_WORMHOLE_NETWORK` when set to Mainnet or Testnet.
 *
 * @returns Configured network, or null when unset / invalid.
 */
export function readWormholeNetworkEnv(): WormholeNetwork | null {
  const configured = process.env.NEXT_PUBLIC_WORMHOLE_NETWORK;
  const parsed = wormholeNetworkSchema.safeParse(configured);
  return parsed.success ? parsed.data : null;
}

/**
 * Maps the desk Solana cluster to a Wormhole Connect network when possible.
 * Localnet has no Wormhole guardians/relayers — returns null so the UI can gate.
 *
 * @param chain - Active Wallet Standard chain id.
 * @returns Wormhole network, or null when bridging must stay disabled.
 */
export function wormholeNetworkForCluster(
  chain: string = SOLANA_CHAIN,
): WormholeNetwork | null {
  switch (chain) {
    case "solana:mainnet":
      return "Mainnet";
    case "solana:devnet":
    case "solana:testnet":
      return "Testnet";
    case "solana:localnet":
      return null;
    default:
      return null;
  }
}

/**
 * Resolves the Connect network for the Bridge view.
 * Explicit `NEXT_PUBLIC_WORMHOLE_NETWORK` wins; otherwise the desk cluster maps
 * to Mainnet/Testnet. Localnet never enables Connect.
 *
 * @returns Active Wormhole network, or null when Bridge must stay gated.
 */
export function resolveWormholeNetwork(): WormholeNetwork | null {
  if (SOLANA_CHAIN === "solana:localnet") {
    return null;
  }
  return readWormholeNetworkEnv() ?? wormholeNetworkForCluster();
}

/**
 * Returns whether Wormhole Connect can run for the current desk cluster.
 *
 * @returns True when a Mainnet or Testnet Connect config is available.
 */
export function wormholeBridgeEnabled(): boolean {
  return resolveWormholeNetwork() !== null;
}

/**
 * Operator-facing copy when Bridge is disabled (typically localnet).
 *
 * @returns Short gate message.
 */
export function wormholeBridgeDisabledMessage(): string {
  return (
    "Wormhole Connect needs Testnet or Mainnet. " +
    "This desk is on localnet, which has no Wormhole guardians. " +
    "Set NEXT_PUBLIC_SOLANA_CLUSTER to solana:devnet (Testnet Connect) or solana:mainnet, " +
    "or set NEXT_PUBLIC_WORMHOLE_NETWORK=Testnet|Mainnet when the Solana cluster is not localnet."
  );
}
