import type { CoverageAssessment } from "../schema/index.js";
import { MAX_REPLAN_ROUNDS } from "./constants.js";

export type CriticVerdict = CoverageAssessment["verdict"];

/**
 * Verdict from score + blockers + re-plan cap — [11 §6](docs/03-algorithms/11-coverage-critic.md).
 * Implements `TG-5b` and `TG-6`.
 */
export function verdict(
  assessment: Pick<CoverageAssessment, "score" | "floor" | "gaps">,
  lap: { replanRounds: number },
): CriticVerdict {
  const blocked =
    assessment.gaps.some((g) => g.severity === "BLOCKER") || assessment.score < assessment.floor;
  if (!blocked) return "PASS";
  if (lap.replanRounds < MAX_REPLAN_ROUNDS) return "REPLAN";
  return "ACCEPT_RISK";
}
