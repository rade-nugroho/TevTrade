import "server-only";

/**
 * Reads a server environment variable and treats blank values as unset.
 */
function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Server configuration for Ollama, Helius, and TypeDB.
 * Secrets stay on the server. The browser reaches Helius through `/api/rpc`.
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
};

/**
 * Loads server environment variables.
 * `OLLAMA_URL_ENPOINT` is accepted because `.env.example` ships that spelling.
 */
export function readServerEnv(): ServerEnv {
  const database = readOptional("TYPEDB_DATABASE") ?? "tevtrade";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(database)) {
    throw new Error("TYPEDB_DATABASE must be 1-64 letters, numbers, underscores, or hyphens.");
  }

  return {
    ollamaApiKey: readOptional("OLLAMA_API_KEY"),
    ollamaUrl: readOptional("OLLAMA_URL_ENDPOINT") ?? readOptional("OLLAMA_URL_ENPOINT"),
    ollamaModel: readOptional("OLLAMA_MODEL") ?? "tev1:4b",
    heliusApiKey: readOptional("HELIUS_API_KEY"),
    heliusUrl: readOptional("HELIUS_URL"),
    typedbUrl: readOptional("TYPEDB_URL"),
    typedbToken: readOptional("TYPEDB_TOKEN"),
    typedbDatabase: database,
  };
}
