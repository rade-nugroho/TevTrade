import "server-only";

import { z } from "zod";
import { readServerEnv } from "./env";

const queryResponseSchema = z.object({
  answers: z.array(z.record(z.string(), z.unknown())).optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});

const SCHEMA_QUERY = `
define
attribute topic, value string;
attribute stance, value string;
attribute rationale, value string;
entity trading-rule, owns topic, owns stance, owns rationale;
`.trim();

const SEED_QUERY = `
insert
$rule1 isa trading-rule,
  has topic "position size",
  has stance "Cap a single position at 2 percent of equity.",
  has rationale "A wrong local decision stays small.";
$rule2 isa trading-rule,
  has topic "uncertainty",
  has stance "Stand aside when the rule book has no matching topic.",
  has rationale "Missing facts are not a signal to trade.";
$rule3 isa trading-rule,
  has topic "signing",
  has stance "Never request a seed phrase or a signature.",
  has rationale "The wallet signs only after a person confirms the transaction.";
`.trim();

const READ_QUERY = `
match
$rule isa trading-rule, has topic $topic, has stance $stance, has rationale $rationale;
fetch {
  "topic": $topic,
  "stance": $stance,
  "rationale": $rationale
};
`.trim();

/**
 * A trading rule read from TypeDB.
 */
export type TradingRule = {
  readonly topic: string;
  readonly stance: string;
  readonly rationale: string;
};

/**
 * Facts the decision model is allowed to see.
 */
export type DecisionFacts = {
  readonly status: "ok" | "unconfigured" | "empty" | "error";
  readonly summary: string;
};

/**
 * Structured rule-book payload for Desk Analytics.
 */
export type TradingRulesResult = {
  readonly status: "ok" | "unconfigured" | "empty" | "error";
  readonly summary: string;
  readonly rules: readonly TradingRule[];
};

let ruleBookReady: Promise<void> | null = null;

/**
 * Reads the local rule book with structured rows for Analytics.
 * Missing configuration does not throw.
 */
export async function listTradingRules(): Promise<TradingRulesResult> {
  const { typedbUrl, typedbToken } = readServerEnv();
  if (!typedbUrl) {
    return {
      status: "unconfigured",
      summary:
        "TypeDB is not configured. Set TYPEDB_URL to the HTTP root (for example http://127.0.0.1:8000) and TYPEDB_TOKEN from POST /v1/signin.",
      rules: [],
    };
  }
  if (!typedbToken) {
    return {
      status: "unconfigured",
      summary:
        "TYPEDB_URL is set, but TYPEDB_TOKEN is missing. With TypeDB running locally, run POST /v1/signin (default admin credentials) and set the returned bearer token.",
      rules: [],
    };
  }

  try {
    await ensureRuleBook();
    const rules = await fetchRules();
    if (rules.length === 0) {
      return { status: "empty", summary: "TypeDB returned no trading rules.", rules: [] };
    }
    const summary = rules
      .map((rule) => `- ${rule.topic}: ${rule.stance} ${rule.rationale}`)
      .join("\n")
      .slice(0, 4_000);
    return { status: "ok", summary, rules };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TypeDB request failed.";
    const authHint =
      /aut|token|bearer|unauthorized|401/i.test(message)
        ? " Refresh TYPEDB_TOKEN with POST /v1/signin."
        : "";
    return {
      status: "error",
      summary: `TypeDB is unavailable. ${message}${authHint}`,
      rules: [],
    };
  }
}

/**
 * Reads the local rule book. Missing configuration does not throw.
 */
export async function readDecisionFacts(): Promise<DecisionFacts> {
  const result = await listTradingRules();
  return { status: result.status, summary: result.summary };
}

/**
 * Creates the database, schema, and seed rules once per process.
 */
function ensureRuleBook(): Promise<void> {
  ruleBookReady ??= prepareRuleBook().catch((error: unknown) => {
    ruleBookReady = null;
    throw error;
  });
  return ruleBookReady;
}

/**
 * Ensures the `tevtrade` database contains the trading-rule schema and seed data.
 */
async function prepareRuleBook(): Promise<void> {
  const { typedbDatabase } = readServerEnv();
  const existing = await typedbFetch(`/v1/databases/${typedbDatabase}`, { method: "GET" });
  if (existing.status === 404) {
    const created = await typedbFetch(`/v1/databases/${typedbDatabase}`, { method: "POST" });
    if (!created.ok && created.status !== 400) {
      throw new Error(await readError(created));
    }
  } else if (!existing.ok) {
    throw new Error(await readError(existing));
  }

  try {
    const rules = await fetchRules();
    if (rules.length > 0) return;
  } catch {
    await oneShot("schema", SCHEMA_QUERY, true);
  }

  const rules = await fetchRules();
  if (rules.length === 0) {
    await oneShot("write", SEED_QUERY, true);
  }
}

/**
 * Fetches trading rules as concept documents.
 */
async function fetchRules(): Promise<readonly TradingRule[]> {
  const payload = await oneShot("read", READ_QUERY, false);
  return (payload.answers ?? [])
    .map((answer) => ({
      topic: readField(answer.topic),
      stance: readField(answer.stance),
      rationale: readField(answer.rationale),
    }))
    .filter((rule) => rule.topic && rule.stance && rule.rationale);
}

/**
 * Runs one TypeDB HTTP query and commits when asked.
 */
async function oneShot(
  transactionType: "read" | "write" | "schema",
  query: string,
  commit: boolean,
): Promise<z.infer<typeof queryResponseSchema>> {
  const { typedbDatabase } = readServerEnv();
  const response = await typedbFetch("/v1/query", {
    method: "POST",
    body: JSON.stringify({
      databaseName: typedbDatabase,
      transactionType,
      query,
      commit,
      queryOptions: { answerCountLimit: 20 },
    }),
  });
  const payload = queryResponseSchema.safeParse(await response.json());
  if (!response.ok || !payload.success) {
    const message = payload.success ? payload.data.message : undefined;
    throw new Error(message || `TypeDB query failed (${response.status}).`);
  }
  if (payload.data.code && payload.data.message) {
    throw new Error(payload.data.message);
  }
  return payload.data;
}

/**
 * Calls the TypeDB HTTP API. The token stays in the Authorization header.
 */
async function typedbFetch(path: string, init: RequestInit): Promise<Response> {
  const { typedbUrl, typedbToken } = readServerEnv();
  if (!typedbUrl) {
    throw new Error("TYPEDB_URL is not set.");
  }
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (typedbToken) headers.set("authorization", `Bearer ${typedbToken}`);
  return fetch(`${typedbUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(12_000),
  });
}

/**
 * Reads a TypeDB error message without forwarding the raw body.
 */
async function readError(response: Response): Promise<string> {
  try {
    const payload = queryResponseSchema.safeParse(await response.json());
    if (payload.success && payload.data.message) return payload.data.message;
  } catch {
    return `TypeDB request failed (${response.status}).`;
  }
  return `TypeDB request failed (${response.status}).`;
}

/**
 * Reads a fetch-document field that may be a string or a TypeDB value object.
 */
function readField(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === "string" || typeof inner === "number") return String(inner).slice(0, 500);
  }
  return "";
}
