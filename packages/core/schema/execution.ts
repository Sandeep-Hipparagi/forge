import { z } from "zod";
import { Gap } from "./critique.js";
import { Id, Iso } from "./primitives.js";

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
  healAttempts: z.record(z.number().int().nonnegative()),
  acceptedRisk: z.array(Gap).default([]),
  specPath: z.string().nullable(),
  startedAt: Iso,
  bankedAt: Iso.nullable(),
});

export const RunStatus = z.enum([
  "QUEUED",
  "RUNNING",
  "VERIFIED",
  "FAIL_WITH_EVIDENCE",
  "ESCALATED",
  "FLAKY",
  "ERROR",
]);

export const StepStatus = z.enum(["PASSED", "FAILED", "SKIPPED", "HEALED", "FLAKY"]);

export const Run = z.object({
  id: Id,
  lapId: Id,
  scenarioId: z.string(),
  status: RunStatus,
  attempt: z.number().int().min(0),
  startedAt: Iso,
  finishedAt: Iso.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  verification: z.object({
    healedStepRerun: z.boolean().default(false),
    fullFlowRerun: z.boolean().default(false),
  }),
  diagnosisSource: z.enum(["deterministic", "llm", "llm+deterministic"]).nullable(),
});

export const SessionEventType = z.enum([
  "session.started",
  "explore.state",
  "explore.finished",
  "capabilities.ranked",
  "lap.started",
  "plan.drafted",
  "critique.finished",
  "critique.replan",
  "generate.validated",
  "generate.dropped",
  "run.started",
  "step.finished",
  "evidence.captured",
  "triage.finished",
  "heal.candidates",
  "heal.decided",
  "heal.patched",
  "heal.rolled_back",
  "verify.finished",
  "lap.banked",
  "report.generated",
  "session.finished",
]);

export const SessionEvent = z.object({
  seq: z.number().int().nonnegative(),
  sessionId: Id,
  lapId: Id.nullable(),
  at: Iso,
  actor: z.enum([
    "orchestrator",
    "explorer",
    "planner",
    "critic",
    "generator",
    "runner",
    "triage",
    "healer",
    "reporter",
    "human",
  ]),
  type: SessionEventType,
  payload: z.record(z.unknown()),
});

export const EvidenceType = z.enum([
  "SNAPSHOT",
  "DOM",
  "SCREENSHOT",
  "CROP",
  "TRACE",
  "CONSOLE",
  "NETWORK",
  "DIFF",
  "PATCH",
  "TRANSCRIPT",
  "PLAN",
  "REPORT",
]);

export const Evidence = z.object({
  id: Id,
  sessionId: Id,
  lapId: Id.nullable(),
  runId: Id.nullable(),
  stepId: z.string().nullable(),
  type: EvidenceType,
  path: z.string(),
  sha256: z.string().length(64),
  bytes: z.number().int().nonnegative(),
  capturedAt: Iso,
  label: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type LapStatus = z.infer<typeof LapStatus>;
export type LapOutcome = z.infer<typeof LapOutcome>;
export type Lap = z.infer<typeof Lap>;
export type RunStatus = z.infer<typeof RunStatus>;
export type Run = z.infer<typeof Run>;
export type SessionEventType = z.infer<typeof SessionEventType>;
export type SessionEvent = z.infer<typeof SessionEvent>;
export type EvidenceType = z.infer<typeof EvidenceType>;
export type Evidence = z.infer<typeof Evidence>;
