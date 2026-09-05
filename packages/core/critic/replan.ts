import type { CoverageAssessment, Gap, Lap, TestPlan } from "../schema/index.js";
import type { IdGen } from "../src/env.js";
import { assessCoverage } from "../critic/assess.js";
import { MAX_REPLAN_ROUNDS } from "../critic/constants.js";
import type { CapabilitySubgraph } from "../critic/types.js";
import { templatePlan } from "../plan/template.js";

export type ReplanRound = {
  plan: TestPlan;
  assessment: CoverageAssessment;
  carriedGaps: Gap[];
};

export type ReplanLoopResult = {
  rounds: ReplanRound[];
  final: CoverageAssessment;
  acceptedRisk: Gap[];
};

/**
 * Deterministic plan → critique → re-plan loop ([11 §7](docs/03-algorithms/11-coverage-critic.md)).
 * Cap is `MAX_REPLAN_ROUNDS`; exhaustion yields `ACCEPT_RISK`, never a silent pass.
 */
export function runReplanLoop(input: {
  subgraph: CapabilitySubgraph;
  lap: Pick<Lap, "id" | "replanRounds">;
  ids: IdGen;
  createdAt: string;
  /** Optional seed plan for round 0; otherwise the template plan is used. */
  seedPlan?: TestPlan;
  seedRationale?: string;
}): ReplanLoopResult {
  const rounds: ReplanRound[] = [];
  let replanRounds = input.lap.replanRounds;
  let carriedGaps: Gap[] = [];
  let rationale = input.seedRationale ?? "";

  for (let round = 0; round <= MAX_REPLAN_ROUNDS; round++) {
    let plan: TestPlan;
    if (round === 0 && input.seedPlan) {
      plan = { ...input.seedPlan, round: 0 };
    } else {
      const built = templatePlan(input.subgraph, input.ids, {
        lapId: input.lap.id,
        capabilityId: input.seedPlan?.capabilityId ?? "cap_template",
        round,
        createdAt: input.createdAt,
      });
      plan = built.plan;
      rationale = built.rationale;
      // Address carried gaps by ensuring the template (already multi-class) is used;
      // carriedGaps are retained on the assessment trail for the report.
      void carriedGaps;
    }

    const assessment = assessCoverage({
      plan,
      subgraph: input.subgraph,
      lap: { id: input.lap.id, replanRounds },
      ids: input.ids,
      createdAt: input.createdAt,
      rationale,
    });

    rounds.push({ plan, assessment, carriedGaps: [...carriedGaps] });

    if (assessment.verdict === "PASS") {
      return { rounds, final: assessment, acceptedRisk: [] };
    }
    if (assessment.verdict === "ACCEPT_RISK") {
      return { rounds, final: assessment, acceptedRisk: assessment.gaps };
    }

    // REPLAN — spend a round and carry gaps
    replanRounds += 1;
    carriedGaps = assessment.gaps;
  }

  const last = rounds[rounds.length - 1]!;
  return { rounds, final: last.assessment, acceptedRisk: last.assessment.gaps };
}
