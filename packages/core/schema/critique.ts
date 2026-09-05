import { z } from "zod";
import { Confidence, Id, Iso, Severity } from "./primitives.js";
import { ScenarioClass } from "./plan.js";

export const GapClass = z.enum(["MISSING_FLOW", "MISSING_EDGE_CASE", "MISSING_ERROR_STATE"]);

export const Gap = z.object({
  id: Id,
  class: GapClass,
  title: z.string().max(120),
  why: z.string().max(400),
  severity: Severity,
  suggestedScenario: z.string().max(400),
  affordanceRefs: z.array(z.string()).default([]),
});

export const CoverageAssessment = z.object({
  id: Id,
  lapId: Id,
  planId: Id,
  round: z.number().int().min(0).max(2),
  score: Confidence,
  floor: Confidence,
  structural: z.object({
    affordancesExercised: z.number().int().nonnegative(),
    affordancesTotal: z.number().int().nonnegative(),
    transitionsTraversed: z.number().int().nonnegative(),
    transitionsTotal: z.number().int().nonnegative(),
    statesReached: z.number().int().nonnegative(),
    statesTotal: z.number().int().nonnegative(),
    classesPresent: z.array(ScenarioClass),
  }),
  gaps: z.array(Gap),
  residualGaps: z.array(Gap).default([]),
  prdGaps: z
    .array(
      z.object({
        requirement: z.string(),
        prdSectionRef: z.string(),
        severity: Severity,
      }),
    )
    .default([]),
  verdict: z.enum(["PASS", "REPLAN", "ACCEPT_RISK"]),
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),
  createdAt: Iso,
});

export type GapClass = z.infer<typeof GapClass>;
export type Gap = z.infer<typeof Gap>;
export type CoverageAssessment = z.infer<typeof CoverageAssessment>;
