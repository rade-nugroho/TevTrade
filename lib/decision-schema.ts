import { z } from "zod";

/**
 * One turn stored in the decision chat.
 */
export const decisionMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(8_000),
});

/**
 * Request body for `POST /api/decision`.
 */
export const decisionRequestSchema = z.object({
  messages: z.array(decisionMessageSchema).min(1).max(40),
  walletAddress: z.string().trim().min(32).max(44).optional(),
});

/**
 * Inferred decision request.
 */
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

/**
 * One NDJSON event from the decision stream.
 */
export const decisionEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("context"),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("token"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("done"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
]);

/**
 * Inferred decision stream event.
 */
export type DecisionEvent = z.infer<typeof decisionEventSchema>;
