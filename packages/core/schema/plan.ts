import { z } from "zod";
import { Id, Iso, Priority } from "./primitives.js";

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

export const ASSERTION_KINDS = ["assertText", "assertVisible", "assertUrl", "assertCount"] as const;

export const TestStep = z.object({
  id: z.string().regex(/^s\d+$/),
  order: z.number().int().nonnegative(),
  kind: StepKind,
  targetIntent: z.string().min(3).max(160),
  stateId: Id,
  affordanceRef: z.string().nullable(),
  locator: z.string().nullable(),
  input: z.string().nullable(),
  timeoutMs: z.number().int().positive().default(5_000),
  optional: z.boolean().default(false),
  fingerprintId: Id.nullable().default(null),
  resolvedCount: z.number().int().nonnegative().nullable().default(null),
});

export const ScenarioClass = z.enum(["happy", "negative", "boundary", "error_state"]);

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
  source: z.enum(["agent", "prd", "intent", "critic_gap", "human"]).default("agent"),
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

export type StepKind = z.infer<typeof StepKind>;
export type TestStep = z.infer<typeof TestStep>;
export type ScenarioClass = z.infer<typeof ScenarioClass>;
export type Scenario = z.infer<typeof Scenario>;
export type TestPlan = z.infer<typeof TestPlan>;
