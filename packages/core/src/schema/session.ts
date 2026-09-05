import { z } from "zod";

export const Confidence = z.number().min(0).max(1);

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
