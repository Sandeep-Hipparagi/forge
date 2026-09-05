import type { CoverageAssessment, Gap, TestPlan } from "../schema/index.js";
import type { IdGen } from "../src/env.js";
import { classGaps } from "./class-gaps.js";
import { COVERAGE_FLOOR } from "./constants.js";
import { structuralScore } from "./structural.js";
import type { CapabilitySubgraph, ClassGapsOptions } from "./types.js";
import { verdict } from "./verdict.js";

export type AssessInput = {
  plan: TestPlan;
  subgraph: CapabilitySubgraph;
  lap: { id: string; replanRounds: number };
  ids: IdGen;
  createdAt: string;
  rationale?: string;
  /** Gaps from a prior semantic half — clamped to MAJOR before merge. */
  semanticGaps?: Gap[];
};

function clampSemantic(gaps: Gap[]): Gap[] {
  return gaps.map((g) => (g.severity === "BLOCKER" ? { ...g, severity: "MAJOR" as const } : g));
}

/**
 * Full structural assessment — [11 §2](docs/03-algorithms/11-coverage-critic.md).
 * Runs with the model gone (`source: "deterministic"`).
 */
export function assessCoverage(input: AssessInput): CoverageAssessment {
  const options: ClassGapsOptions = {};
  if (input.rationale !== undefined) options.rationale = input.rationale;

  const structural = structuralScore(input.plan, input.subgraph);
  const deterministicGaps = classGaps(input.plan, input.subgraph, options);
  const semantic = clampSemantic(input.semanticGaps ?? []);
  const gaps = [...deterministicGaps, ...semantic];

  const draft: Pick<CoverageAssessment, "score" | "floor" | "gaps"> = {
    score: structural.score,
    floor: COVERAGE_FLOOR,
    gaps,
  };
  const v = verdict(draft, input.lap);

  const residualGaps = v === "PASS" ? gaps.filter((g) => g.severity !== "BLOCKER") : [];

  return {
    id: input.ids.next("cva"),
    lapId: input.lap.id,
    planId: input.plan.id,
    round: input.plan.round,
    score: structural.score,
    floor: COVERAGE_FLOOR,
    structural: {
      affordancesExercised: structural.affordances.numerator,
      affordancesTotal: structural.affordances.denominator,
      transitionsTraversed: structural.transitions.numerator,
      transitionsTotal: structural.transitions.denominator,
      statesReached: structural.states.numerator,
      statesTotal: structural.states.denominator,
      classesPresent: structural.classes.present,
    },
    gaps,
    residualGaps,
    prdGaps: [],
    verdict: v,
    source: semantic.length > 0 ? "llm+deterministic" : "deterministic",
    createdAt: input.createdAt,
  };
}
