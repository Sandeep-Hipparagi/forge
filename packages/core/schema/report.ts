import { z } from "zod";
import { Gap } from "./critique.js";
import { RiskFactors } from "./perception.js";
import { Confidence, Id, Iso, Priority, Severity } from "./primitives.js";
import { ScenarioClass } from "./plan.js";

export const UntestedFlowRisk = z.object({
  capabilityId: Id,
  name: z.string(),
  why: z.string().max(300),
  riskScore: Confidence,
  factors: RiskFactors,
});

export const RobustnessScore = z.object({
  current: z.number().min(0).max(100),
  projected: z.number().min(0).max(100),
  components: z.record(z.number()),
  perCapability: z.array(
    z.object({
      capabilityId: Id,
      name: z.string(),
      points: z.number(),
      lostBecause: z.array(z.string()),
    }),
  ),
  findings: z.array(
    z.object({
      findingId: Id,
      title: z.string(),
      pointsIfFixed: z.number(),
    }),
  ),
});

export const QualityReport = z.object({
  id: Id,
  sessionId: Id,
  scenariosCovered: z.array(
    z.object({
      scenarioId: z.string(),
      capability: z.string(),
      title: z.string(),
      class: ScenarioClass,
      priority: Priority,
    }),
  ),
  outcomes: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    healed: z.number().int().nonnegative(),
    flaky: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  healerActions: z.array(
    z.object({
      runId: Id,
      stepId: z.string(),
      decision: z.enum(["HEALED", "BLOCKED", "ESCALATED"]),
      vetoId: z.string().nullable(),
      before: z.string(),
      after: z.string().nullable(),
      confidence: Confidence,
      verified: z.boolean(),
    }),
  ),
  coverageGapsRemaining: z.array(Gap),
  untestedFlowRisk: z.array(UntestedFlowRisk),
  defects: z.array(
    z.object({
      diagnosisId: Id,
      capability: z.string(),
      expected: z.string(),
      actual: z.string(),
      severity: Severity,
    }),
  ),
  score: RobustnessScore,
  hoursSaved: z
    .object({
      estimate: z.number(),
      assumptions: z.array(z.string()).min(1),
    })
    .nullable(),
  generatedAt: Iso,
});

export type UntestedFlowRisk = z.infer<typeof UntestedFlowRisk>;
export type RobustnessScore = z.infer<typeof RobustnessScore>;
export type QualityReport = z.infer<typeof QualityReport>;
