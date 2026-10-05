import "server-only";

import { z } from "zod";
import { readServerEnv } from "./env";
import {
  buildChatCompletionBody,
  buildDecisionTask,
  clipDecisionText,
  readDecisionLetter,
  type DecisionOption,
} from "./tev-decision";

const ACTIONS = [
  {
    key: "add",
    description: "Take the requested action, and cap any single position at 2 percent of equity.",
  },
  {
    key: "stand_aside",
    description: "Do not act. A required fact is missing, or the rules say to stand aside.",
  },
  {
    key: "none",
    description: "None of the listed actions fit the question.",
  },
] as const;

const QUESTION = "Which listed action best fits the request in the state?";

/**
 * Turns one mapped letter into the text shown in the decision chat.
 * The letter is the whole model answer. It is not a probability and not authority to trade.
 *
 * @param choice - Option selected from the completion letter.
 * @returns Desk text for the assistant message.
 */
function formatDecision(choice: DecisionOption): string {
  return [
    `Decision: ${choice.description}`,
    `Choice: ${choice.key.replaceAll("_", " ")}`,
    `Letter: ${choice.label}`,
    "This letter is the whole answer. Do not use it as the sole authority for a trade.",
  ].join("\n");
}

/**
 * Asks the configured Tev1 checkpoint for one action.
 * The request follows the model card: a system instruction, then JSON with state, question, and options.
 *
 * @param input - Chat history, rule book, chain note, and the token callback.
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

  const task = buildDecisionTask({
    state: buildState(input),
    question: QUESTION,
    options: ACTIONS,
  });
  const body = buildChatCompletionBody({
    model: ollamaModel,
    task,
    includeOllamaThinkingOff: usesOllamaThinkingSwitch(baseUrl),
  });

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error(
      `The decision runtime is not reachable at ${safeHost(baseUrl)}. Start Ollama with \`ollama serve\`, or set OLLAMA_URL_ENDPOINT to a vLLM server.`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readFailure(payload, response.status, ollamaModel));
  }

  const choice = readDecisionLetter(payload, task.options);
  input.onToken(formatDecision(choice));
}

/**
 * Joins the rule book, chain note, and chat into the decision state.
 * The caller's words stay inside state so the model treats them as data.
 *
 * @param input - Messages, rules, and chain note already collected by the desk.
 * @returns State text for the Tev1 user message.
 */
function buildState(input: {
  readonly messages: readonly { role: "user" | "assistant"; text: string }[];
  readonly facts: string;
  readonly chain: string;
}): string {
  const request = input.messages.at(-1)?.text ?? "";
  const earlierTurns = input.messages
    .slice(0, -1)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");
  const parts = [
    `Rules:\n${clipDecisionText(input.facts, 2_000)}`,
    `Chain:\n${clipDecisionText(input.chain, 800)}`,
  ];
  if (earlierTurns.trim()) {
    parts.push(`Earlier turns:\n${clipDecisionText(earlierTurns, 1_500)}`);
  }
  parts.push(`Request:\n${clipDecisionText(request, 1_500)}`);
  return parts.join("\n\n");
}

/**
 * Picks the decision host. A key with no URL targets ollama.com.
 *
 * @returns Base URL without a trailing slash.
 */
function resolveOllamaUrl(): string {
  const { ollamaUrl, ollamaApiKey } = readServerEnv();
  return (ollamaUrl ?? (ollamaApiKey ? "https://ollama.com" : "http://127.0.0.1:11434")).replace(
    /\/$/,
    "",
  );
}

/**
 * Builds the chat completions URL.
 * A host that already ends in `/v1` or `/api` is normalized first.
 *
 * @param baseUrl - Configured Ollama or vLLM origin.
 * @returns OpenAI-compatible chat completions URL.
 */
function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  if (trimmed.endsWith("/v1/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

/**
 * Reports whether this host needs Ollama's thinking switch.
 * Ollama 0.35 ignores `chat_template_kwargs` on chat completions.
 * `reasoning_effort: "none"` is what turns thinking off there.
 * vLLM keeps the model-card fields only.
 *
 * @param baseUrl - Configured decision host.
 * @returns True for local Ollama and ollama.com.
 */
function usesOllamaThinkingSwitch(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.port === "11434" || url.hostname === "ollama.com" || url.hostname.endsWith(".ollama.com")
    );
  } catch {
    return true;
  }
}

const errorStringSchema = z.object({
  error: z.string(),
});

const errorObjectSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

/**
 * Turns an HTTP error into a short operator message.
 *
 * @param payload - Response JSON, when the body parsed.
 * @param status - HTTP status code.
 * @param model - Configured model name.
 * @returns A message safe to show in the desk.
 */
function readFailure(payload: unknown, status: number, model: string): string {
  const detail = readErrorDetail(payload).slice(0, 200);
  if (status === 404 || /not found/i.test(detail)) {
    return `No model "${model}" is loaded. For Ollama run \`ollama pull tev1:0.8b\`. For vLLM serve togethercomputer/Tev1-0.8B-experimental and set OLLAMA_MODEL to that id.`;
  }
  return detail || `The decision runtime returned HTTP ${status}.`;
}

/**
 * Reads an error string from either an Ollama or an OpenAI error body.
 *
 * @param payload - Response JSON, when the body parsed.
 * @returns The error text, or an empty string when the body has none.
 */
function readErrorDetail(payload: unknown): string {
  const asString = errorStringSchema.safeParse(payload);
  if (asString.success) return asString.data.error;
  const asObject = errorObjectSchema.safeParse(payload);
  if (asObject.success) return asObject.data.error.message;
  return "";
}

/**
 * Returns the host without a path, query, or embedded secret.
 *
 * @param url - Configured decision URL.
 * @returns Host, or a generic label when the URL cannot be parsed.
 */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the configured decision host";
  }
}

/**
 * Detects an aborted fetch.
 *
 * @param error - Rejection from `fetch`.
 * @returns True when the caller aborted the request.
 */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
