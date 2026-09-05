import { z } from "zod";
import { Id, Iso } from "./primitives.js";

export const SessionMode = z.enum(["autopilot", "copilot"]);

export const SessionBudget = z.object({
  maxCapabilities: z.number().int().positive().default(20),
  maxDurationMs: z
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  maxUsd: z.number().positive().default(2),
});

export const SessionInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  prd: z.string().max(200_000).optional(),
  intent: z.string().max(2_000).optional(),
  mode: SessionMode.default("autopilot"),
  budget: SessionBudget.default({}),
  /** Opt-in: open a real browser and run explore → plan → run → report. Requires FORGE_LIVE_SESSIONS=true. */
  live: z.boolean().optional(),
});

export const StoredSessionInput = SessionInput.omit({ password: true });

export const SessionStatus = z.enum([
  "CREATED",
  "EXPLORING",
  "PRIORITISING",
  "LAPPING",
  "REPORTING",
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);

export const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
  estimatedUsd: z.number().nonnegative(),
});

export const Session = z.object({
  id: Id,
  input: StoredSessionInput,
  status: SessionStatus,
  authenticated: z.boolean().default(false),
  storageStatePath: z.string().nullable().default(null),
  exitCode: z.number().int().min(0).max(3).nullable(),
  defectsFound: z.number().int().nonnegative().default(0),
  createdAt: Iso,
  finishedAt: Iso.nullable(),
  usage: Usage.nullable(),
});

export type SessionMode = z.infer<typeof SessionMode>;
export type SessionInput = z.input<typeof SessionInput>;
export type ParsedSessionInput = z.output<typeof SessionInput>;
export type StoredSessionInput = z.infer<typeof StoredSessionInput>;
export type SessionStatus = z.infer<typeof SessionStatus>;
export type Usage = z.infer<typeof Usage>;
export type Session = z.infer<typeof Session>;
