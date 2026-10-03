export { structuralScore } from "./structural.js";
export { classGaps } from "./class-gaps.js";
export { verdict, mergeGaps } from "./verdict.js";
export {
  extractPrdRequirements,
  matchRequirementsToPlan,
  buildPrdGaps,
  type PrdRequirement,
} from "./prd-gaps.js";
export {
  COVERAGE_FLOOR,
  MAX_REPLAN_ROUNDS,
  GAP_CAP,
  PRD_GAP_CAP,
} from "./types.js";
export type {
  CapabilitySubgraph,
  StructuralCoverage,
  Gap,
  CoverageAssessment,
  LapState,
} from "./types.js";
