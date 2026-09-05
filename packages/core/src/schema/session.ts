import { z } from "zod";
import { Confidence, Id, Iso, Sha256 } from "./primitives.js";

export const SessionMode = z.enum(["autopilot", "copilot"]);

export const SessionInput = z.object({
  url: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  prd: z.string().max(200_000).optional(),
  intent: z.string().max(2_000).optional(),
  mode: SessionMode.default("autopilot"),
  budget: z
    .object({
      maxCapabilities: z.number().int().positive().default(20),
      maxDurationMs: z
        .number()
        .int()
        .positive()
        .default(30 * 60_000),
      maxUsd: z.number().positive().default(2),
    })
    .default({}),
});

export const SessionConfigSnapshot = z.object({
  version: z.literal("forge/v1"),
  model: z.object({
    id: z.string().min(1),
    enabled: z.boolean(),
    timeoutMs: z.number().int().positive(),
  }),
  exploration: z.object({
    allowedHosts: z.array(z.string().min(1)).min(1),
    destructiveActions: z.enum(["deny", "disposable_only"]),
  }),
  coverage: z.object({
    floor: Confidence,
    maxReplanRounds: z.number().int().min(0).max(2),
  }),
  healing: z.object({
    autoHealThreshold: Confidence,
    reviewThreshold: Confidence,
    minMargin: Confidence,
  }),
  budget: z.object({
    maxCapabilities: z.number().int().positive(),
    maxDurationMs: z.number().int().positive(),
    maxUsd: z.number().positive(),
  }),
  redactionPolicyVersion: z.string().min(1),
  secretProvider: z.literal("env"),
});

export type SessionConfigSnapshot = z.infer<typeof SessionConfigSnapshot>;

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

/** Credential-free shape permitted in durable rows, events, and API responses. */
export const PersistedSessionInput = SessionInput.omit({
  password: true,
}).strict();

export const Session = z.object({
  id: Id,
  input: PersistedSessionInput,
  status: SessionStatus,
  authenticated: z.boolean().default(false),
  config: SessionConfigSnapshot,
  configSha256: Sha256,
  storageStatePath: z.string().nullable().default(null),
  exitCode: z.number().int().min(0).max(3).nullable(),
  defectsFound: z.number().int().nonnegative().default(0),
  createdAt: Iso,
  finishedAt: Iso.nullable(),
  usage: z
    .object({
      inputTokens: z.number().int(),
      outputTokens: z.number().int(),
      cacheReadTokens: z.number().int(),
      calls: z.number().int(),
      estimatedUsd: z.number(),
    })
    .nullable(),
});

export type SessionInput = z.input<typeof SessionInput>;
export type SessionStatus = z.infer<typeof SessionStatus>;
export type PersistedSessionInput = z.infer<typeof PersistedSessionInput>;
export type Session = z.infer<typeof Session>;

export const defaultSessionConfig = (): SessionConfigSnapshot =>
  SessionConfigSnapshot.parse({
    version: "forge/v1",
    model: { id: "claude-opus-5", enabled: false, timeoutMs: 20_000 },
    exploration: {
      allowedHosts: ["localhost", "127.0.0.1"],
      destructiveActions: "deny",
    },
    coverage: { floor: 0.7, maxReplanRounds: 2 },
    healing: {
      autoHealThreshold: 0.85,
      reviewThreshold: 0.65,
      minMargin: 0.05,
    },
    budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
    redactionPolicyVersion: "forge/redaction/v1",
    secretProvider: "env",
  });
