import "server-only";

import { z } from "zod";
import { readServerEnv } from "./env";

const ACTIONS = {
  add: "Take the requested action, and cap any single position at 2 percent of equity.",
  stand_aside: "Do not act. A required fact is missing, or the rules say to stand aside.",
  none: "None of the listed actions fit the question.",
} as const;

const choiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});

const noulAnswerSchema = z.object({
  type: z.literal("noul"),
  noul: z.number(),
});

const systemOneResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.object({
    action: choiceAnswerSchema,
    enough_information: noulAnswerSchema,
  }),
  error: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

/**
 * Asks `tev1:4b` for one action through Ollama's decision endpoint.
 * The model returns a choice and probabilities. It does not write an explanation.
 */
export async function streamOllamaDecision(input: {
  readonly messages: readonly { role: "user" | "assistant"; text: string }[];
  readonly facts: string;
  readonly chain: string;
  readonly signal: AbortSignal;
  readonly onToken: (text: string) => void;
}): Promise<void> {
  const { ollamaApiKey, ollamaModel } = readServerEnv();
  const baseUrl = resolveOllamaUrl();
  if (baseUrl.includes("ollama.com") && !ollamaApiKey) {
    throw new Error("OLLAMA_API_KEY is required when OLLAMA_URL_ENDPOINT points at ollama.com.");
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ollamaApiKey) headers.authorization = `Bearer ${ollamaApiKey}`;

  const question = input.messages.at(-1)?.text ?? "";
  const earlierTurns = input.messages
    .slice(0, -1)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

  let response: Response;
  try {
    response = await fetch(systemOneUrl(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ollamaModel,
        state: {
          question: clip(question, 1_500),
          earlier_turns: clip(earlierTurns, 1_500),
          rules: clip(input.facts, 2_000),
          chain: clip(input.chain, 800),
        },
        questions: {
          action: {
            type: "choice",
            instructions:
              "Which listed action best fits the question in the state, given the rules and the chain note?",
            criteria: ACTIONS,
          },
          enough_information: {
            type: "noul",
            instructions: "Does the state contain the facts needed to act on the question?",
          },
        },
      }),
      signal: input.signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error(
      `Ollama is not reachable at ${safeHost(baseUrl)}. Start it with \`ollama serve\` or set OLLAMA_URL_ENDPOINT.`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readFailure(payload, response.status, ollamaModel));
  }

  const parsed = systemOneResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`${ollamaModel} returned a decision the desk could not read.`);
  }
  if (parsed.data.error) {
    throw new Error(parsed.data.error.slice(0, 200));
  }

  input.onToken(formatDecision(parsed.data.answers));
}

/**
 * Picks the Ollama host. A key with no URL targets ollama.com.
 */
function resolveOllamaUrl(): string {
  const { ollamaUrl, ollamaApiKey } = readServerEnv();
  return (ollamaUrl ?? (ollamaApiKey ? "https://ollama.com" : "http://127.0.0.1:11434")).replace(
    /\/$/,
    "",
  );
}

/**
 * Builds the decision URL. A host that already ends in `/api` is trimmed first.
 */
function systemOneUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/api$/, "").replace(/\/$/, "")}/v1/systemone`;
}

/**
 * Turns the structured decision into the text shown in the chat.
 * Concentration describes how peaked the probabilities are. It is not accuracy.
 */
function formatDecision(answers: z.infer<typeof systemOneResponseSchema>["answers"]): string {
  const { action, enough_information: enough } = answers;
  const label = ACTIONS[action.choice as keyof typeof ACTIONS] ?? action.choice;
  const probabilities = Object.entries(action.probabilities)
    .map(([name, probability]) => `${name.replaceAll("_", " ")} ${percent(probability)}`)
    .join(", ");
  const informed = enough.noul >= 0.5 ? "yes" : "no";

  return [
    `Decision: ${label}`,
    `Choice: ${action.choice.replaceAll("_", " ")}`,
    `Probabilities: ${probabilities}`,
    `Concentration: ${percent(action.confidence)}. This is not the chance the choice is correct.`,
    `Enough information to act: ${informed} (${percent(enough.noul)}).`,
  ].join("\n");
}

/**
 * Formats a 0–1 probability as a whole percent.
 */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Keeps decision state inside Tev1's short context window.
 */
function clip(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}…`;
}

/**
 * Turns an Ollama HTTP error into a short operator message.
 */
function readFailure(payload: unknown, status: number, model: string): string {
  const parsed = errorResponseSchema.safeParse(payload);
  const detail = parsed.success ? parsed.data.error?.slice(0, 200) : undefined;
  if (status === 404 || /not found/i.test(detail ?? "")) {
    return `Ollama has no model "${model}", or this Ollama build has no /v1/systemone endpoint. Tev1 needs Ollama 0.35 or later.`;
  }
  return detail || `Ollama returned HTTP ${status}.`;
}

/**
 * Returns the host without a path, query, or embedded secret.
 */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the configured Ollama host";
  }
}

/**
 * Detects an aborted fetch.
 */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
