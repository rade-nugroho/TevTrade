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
