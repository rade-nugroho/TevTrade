/**
 * Wallet Standard chain id for the browser client.
 * Defaults to devnet. Set `NEXT_PUBLIC_SOLANA_CLUSTER` to change it.
 */
export const SOLANA_CHAIN = ((): "solana:devnet" | "solana:testnet" | "solana:mainnet" | "solana:localnet" => {
  const configured = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (
    configured === "solana:devnet" ||
    configured === "solana:testnet" ||
    configured === "solana:mainnet" ||
    configured === "solana:localnet"
  ) {
    return configured;
  }
  return "solana:devnet";
})();

/**
 * Short label for the cluster shown next to the wallet.
 */
export function solanaClusterLabel(chain: string = SOLANA_CHAIN): string {
  switch (chain) {
    case "solana:mainnet":
      return "Mainnet";
    case "solana:testnet":
      return "Testnet";
    case "solana:localnet":
      return "Localnet";
    default:
      return "Devnet";
  }
}

/**
 * Chain id DART/Portal swap quotes target. Titan swap routes are mainnet-only.
 */
export const DART_QUOTE_CHAIN = "solana:mainnet" as const;

/**
 * Returns whether the configured desk cluster can send a DART swap without an
 * explicit mainnet override. Localnet/devnet/testnet never silently send.
 *
 * @param chain - Active Wallet Standard chain id.
 * @returns True only when the desk already targets mainnet.
 */
export function clusterAllowsDartSend(chain: string = SOLANA_CHAIN): boolean {
  return chain === DART_QUOTE_CHAIN;
}

/**
 * Returns whether the operator may sign/send an approved DART route.
 * Allowed when the desk cluster is mainnet, or when the operator explicitly
 * targets the quote chain (mainnet) despite a non-mainnet desk cluster.
 *
 * @param options - Cluster and optional explicit mainnet targeting.
 * @returns True when send is permitted.
 */
export function canSendDartSwap(options: {
  readonly chain?: string;
  readonly targetQuoteChain?: boolean;
}): boolean {
  const chain = options.chain ?? SOLANA_CHAIN;
  if (clusterAllowsDartSend(chain)) return true;
  return options.targetQuoteChain === true;
}

/**
 * Operator-facing refusal when a DART send is blocked by cluster mismatch.
 *
 * @param chain - Active desk cluster.
 * @returns Short message explaining the gate.
 */
export function dartSendBlockedMessage(chain: string = SOLANA_CHAIN): string {
  return (
    `DART routes are ${solanaClusterLabel(DART_QUOTE_CHAIN)} transactions. ` +
    `Configured cluster is ${solanaClusterLabel(chain)}. ` +
    "Refuse send, or explicitly target the quote chain (mainnet) before Approve & execute. " +
    "No fake localnet fill."
  );
}

/**
 * Formats a lamport amount as SOL with four decimal places.
 */
export function formatSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4);
  return `${whole.toString()}.${fraction} SOL`;
}

/**
 * Reads lamports from either a bare bigint or a JSON-RPC balance envelope.
 */
export function readLamports(result: unknown): bigint | null {
  if (typeof result === "bigint") return result;
  if (typeof result === "number" && Number.isFinite(result)) return BigInt(Math.trunc(result));
  if (result && typeof result === "object" && "value" in result) {
    return readLamports((result as { value: unknown }).value);
  }
  return null;
}
