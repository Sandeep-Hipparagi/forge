import { z } from "zod";
import { Confidence, Id, Iso, Priority, Severity } from "./primitives.js";

export const ScenarioClass = z.enum([
  "happy",
  "negative",
  "boundary",
  "error_state",
]);
export const StepKind = z.enum([
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "hover",
  "waitFor",
  "assertText",
  "assertVisible",
  "assertUrl",
  "assertCount",
]);
export const ASSERTION_KINDS = [
  "assertText",
  "assertVisible",
  "assertUrl",
  "assertCount",
] as const;
export const Gap = z.object({
  id: Id,
  class: z.enum(["MISSING_FLOW", "MISSING_EDGE_CASE", "MISSING_ERROR_STATE"]),
  title: z.string().max(120),
  why: z.string().max(400),
  severity: Severity,
  suggestedScenario: z.string().max(400),
  affordanceRefs: z.array(z.string()).default([]),
});
export const TestStep = z.object({
  id: z.string().regex(/^s\d+$/),
  order: z.number().int().nonnegative(),
  kind: StepKind,
  targetIntent: z.string().min(3).max(160),
  stateId: Id,
  affordanceRef: z.string().nullable(),
  locator: z.string().nullable(),
  input: z.string().nullable(),
  timeoutMs: z.number().int().default(5000),
  optional: z.boolean().default(false),
  fingerprintId: Id.nullable().default(null),
  resolvedCount: z.number().int().nullable().default(null),
});
export const Scenario = z.object({
  id: z.string().regex(/^SC-\d{3,}$/),
  planId: Id,
  title: z.string().min(5),
  class: ScenarioClass,
  priority: Priority,
  priorityReason: z.string().max(120),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(TestStep).min(1),
  expectedOutcome: z.string().min(5),
  source: z
    .enum(["agent", "prd", "intent", "critic_gap", "human"])
    .default("agent"),
  sourceRefs: z.array(z.string()).default([]),
  plannedNotGenerated: z.boolean().default(false),
  notGeneratedReason: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
});
export const TestPlan = z.object({
  id: Id,
  lapId: Id,
  capabilityId: Id,
  round: z.number().int().min(0).max(2),
  scenarios: z.array(Scenario).min(1),
  markdownPath: z.string(),
  createdAt: Iso,
});
export const CoverageAssessment = z.object({
  id: Id,
  lapId: Id,
  planId: Id,
  round: z.number().int().min(0).max(2),
  score: Confidence,
  floor: Confidence,
  structural: z.object({
    affordancesExercised: z.number().int(),
    affordancesTotal: z.number().int(),
    transitionsTraversed: z.number().int(),
    transitionsTotal: z.number().int(),
    statesReached: z.number().int(),
    statesTotal: z.number().int(),
    classesPresent: z.array(ScenarioClass),
  }),
  gaps: z.array(Gap),
  residualGaps: z.array(Gap).default([]),
  verdict: z.enum(["PASS", "REPLAN", "ACCEPT_RISK"]),
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),
  createdAt: Iso,
});
export const LapStatus = z.enum([
  "LAP_PENDING",
  "PLANNING",
  "CRITIQUING",
  "GENERATING",
  "RUNNING",
  "TRIAGING",
  "DECIDING",
  "HEALING",
  "VERIFYING",
  "BANKED",
]);
export const LapOutcome = z.enum([
  "VERIFIED",
  "DEFECT_FOUND",
  "ESCALATED",
  "PARTIAL",
  "LAP_FAILED",
]);
export const Lap = z.object({
  id: Id,
  sessionId: Id,
  capabilityId: Id,
  index: z.number().int().nonnegative(),
  status: LapStatus,
  outcome: LapOutcome.nullable(),
  replanRounds: z.number().int().min(0).max(2),
  healAttempts: z.record(z.string(), z.number().int()),
  acceptedRisk: z.array(Gap).default([]),
  specPath: z.string().nullable(),
  startedAt: Iso,
  bankedAt: Iso.nullable(),
});
export type TestPlan = z.infer<typeof TestPlan>;
export type CoverageAssessment = z.infer<typeof CoverageAssessment>;
export type Lap = z.infer<typeof Lap>;
