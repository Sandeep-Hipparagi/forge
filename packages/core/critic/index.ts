export { COVERAGE_FLOOR, MAX_REPLAN_ROUNDS, WEIGHTS, CLASS_COUNT } from "./constants.js";
export { structuralScore, eligibleAffordances, traversedTransitionIds } from "./structural.js";
export { classGaps } from "./class-gaps.js";
export { verdict } from "./verdict.js";
export { assessCoverage } from "./assess.js";
export { runReplanLoop } from "./replan.js";
export type {
  CapabilitySubgraph,
  StructuralCoverage,
  TermFraction,
  ClassGapsOptions,
} from "./types.js";
export type { CriticVerdict } from "./verdict.js";
export type { AssessInput } from "./assess.js";
export type { ReplanLoopResult, ReplanRound } from "./replan.js";
