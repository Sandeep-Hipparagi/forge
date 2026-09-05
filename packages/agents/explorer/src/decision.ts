import { z } from "zod";

/**
 * Call site 1 — ExplorationDecision (07 §3.1, 09 §3.5).
 * The model chooses which frontier refs to exercise; perception and safety stay code.
 */
export const ExplorationDecision = z.object({
  exercise: z
    .array(
      z.object({
        ref: z.string().min(1),
        fromStateId: z.string().min(1),
        reason: z.string().max(120),
      }),
    )
    .max(40),
  stop: z.boolean().optional(),
  stopReason: z.string().max(200).optional(),
});

export type ExplorationDecision = z.infer<typeof ExplorationDecision>;

export const EXPLORER_SYSTEM = [
  "You are FORGE's Explorer. Your only job is choosing which unvisited affordances",
  "are worth exercising next. Perception, signatures, and the destructive deny-list",
  "are computed for you — never invent them.",
  "Call emit_exploration_decision with the refs to exercise (in order) and a one-line reason each.",
  "Set stop=true only when the remaining frontier is clearly not worth exploring.",
].join(" ");

export const EXPLORER_CEILINGS = {
  toolCalls: 40,
  modelTurns: 8,
  wallClockMs: 90_000,
  maxTokens: 2_000,
} as const;
