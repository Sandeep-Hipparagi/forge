import { z } from "zod";
import { BBox, Confidence, Id, Iso } from "./primitives.js";

export const AffordanceKind = z.enum([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "select",
  "tab",
  "menuitem",
  "form",
  "upload",
  "other",
]);

export const Affordance = z.object({
  id: Id,
  stateId: Id,
  ref: z.string(),
  role: z.string(),
  accessibleName: z.string().nullable(),
  kind: AffordanceKind,
  enabled: z.boolean().default(true),
  bbox: BBox.nullable(),
  destructive: z.boolean().default(false),
  observedNotExercised: z.boolean().default(false),
  notExercisedReason: z.string().nullable().default(null),
});

export const State = z.object({
  id: Id,
  sessionId: Id,
  signature: z.string().length(16),
  url: z.string().url(),
  title: z.string(),
  authRequired: z.boolean().default(false),
  snapshotEvidenceId: Id,
  affordanceIds: z.array(Id),
  visitedVariants: z.number().int().positive().default(1),
  discoveredAt: Iso,
});

export const Transition = z.object({
  id: Id,
  sessionId: Id,
  fromStateId: Id,
  toStateId: Id,
  viaAffordanceId: Id,
  action: z.enum(["click", "fill", "select", "navigate", "back", "submit"]),
  observedAt: Iso,
});

export const RiskFactors = z.object({
  authProximity: Confidence,
  dataMutation: Confidence,
  moneyOrPii: Confidence,
  graphCentrality: Confidence,
  affordanceDensity: Confidence,
  statedIntent: Confidence,
});

export const Capability = z.object({
  id: Id,
  sessionId: Id,
  name: z.string().min(2),
  description: z.string().min(10),
  entryStateId: Id,
  stateIds: z.array(Id).min(1),
  exitConditions: z.array(z.string()).min(1),
  dependsOn: z.array(Id).default([]),
  risk: z.object({ score: Confidence, factors: RiskFactors }),
  priorityRank: z.number().int().nonnegative(),
});

export const CapabilityMap = z.object({
  sessionId: Id,
  authenticated: z.boolean(),
  states: z.array(State),
  affordances: z.array(Affordance),
  transitions: z.array(Transition),
  capabilities: z.array(Capability),
  apiHints: z
    .array(
      z.object({
        method: z.string(),
        urlPattern: z.string(),
        seenInStateIds: z.array(Id),
      }),
    )
    .default([]),
  frontier: z.object({
    discovered: z.number().int().nonnegative(),
    explored: z.number().int().nonnegative(),
    haltReason: z.enum(["EXHAUSTED", "STATE_BUDGET", "TIME_BUDGET", "CALL_BUDGET"]),
  }),
});

export type Affordance = z.infer<typeof Affordance>;
export type State = z.infer<typeof State>;
export type Transition = z.infer<typeof Transition>;
export type RiskFactors = z.infer<typeof RiskFactors>;
export type Capability = z.infer<typeof Capability>;
export type CapabilityMap = z.infer<typeof CapabilityMap>;
