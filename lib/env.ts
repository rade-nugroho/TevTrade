import "server-only";

/**
 * Reads a server environment variable and treats blank values as unset.
 */
function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Server configuration for Ollama, Helius, TypeDB, and Titan.
 * Secrets stay on the server. The browser reaches Helius through `/api/rpc`,
 * Portal quotes through `/api/titan/quote`, partner DCA through `/api/titan/*`,
 * and Direct quotes through `/api/titan/direct/*`.
 */
export type ServerEnv = {
  readonly ollamaApiKey: string | undefined;
  readonly ollamaUrl: string | undefined;
  readonly ollamaModel: string;
  readonly heliusApiKey: string | undefined;
  readonly heliusUrl: string | undefined;
  readonly typedbUrl: string | undefined;
  readonly typedbToken: string | undefined;
  readonly typedbDatabase: string;
  /**
   * Optional public Solana address for balance context when no Wallet Standard
   * wallet is connected. Never a secret key or keypair path.
   */
  readonly deskWalletAddress: string | undefined;
  readonly titanApiKey: string | undefined;
  readonly titanApiUrl: string;
  readonly titanDcaBaseUrl: string | undefined;
  readonly titanDcaApiKey: string | undefined;
  readonly titanEndpoint: string | undefined;
  readonly titanJwt: string | undefined;
};

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Loads server environment variables.
 * `OLLAMA_URL_ENPOINT` is accepted because `.env.example` ships that spelling.
 * The decision model defaults to the Ollama tag `tev1:0.8b`.
 */
export function readServerEnv(): ServerEnv {
  const database = readOptional("TYPEDB_DATABASE") ?? "tevtrade";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(database)) {
    throw new Error("TYPEDB_DATABASE must be 1-64 letters, numbers, underscores, or hyphens.");
  }

  const deskWalletAddress = readOptional("DESK_WALLET_ADDRESS");
  if (deskWalletAddress && !ADDRESS_PATTERN.test(deskWalletAddress)) {
    throw new Error("DESK_WALLET_ADDRESS must be a base58 Solana public address (32–44 characters).");
  }

  return {
    ollamaApiKey: readOptional("OLLAMA_API_KEY"),
    ollamaUrl: readOptional("OLLAMA_URL_ENDPOINT") ?? readOptional("OLLAMA_URL_ENPOINT"),
    ollamaModel: readOptional("OLLAMA_MODEL") ?? "tev1:0.8b",
    heliusApiKey: readOptional("HELIUS_API_KEY"),
    heliusUrl: readOptional("HELIUS_URL"),
    typedbUrl: readOptional("TYPEDB_URL"),
    typedbToken: readOptional("TYPEDB_TOKEN"),
    typedbDatabase: database,
    deskWalletAddress,
    titanApiKey: readOptional("TITAN_API_KEY"),
    titanApiUrl: readOptional("TITAN_API_URL") ?? "https://portal.api.titan.exchange",
    titanDcaBaseUrl: readOptional("TITAN_DCA_BASE_URL"),
    titanDcaApiKey: readOptional("TITAN_DCA_API_KEY"),
    titanEndpoint: readOptional("TITAN_ENDPOINT"),
    titanJwt: readOptional("TITAN_JWT"),
  };
}
