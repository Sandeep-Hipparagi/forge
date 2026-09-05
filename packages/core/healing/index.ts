export {
  AMBIGUITY_MARGIN,
  AUTO_HEAL_GATE,
  BASE_TRUST,
  DESTRUCTIVE_HEAL,
  FAIL_GATE,
  HEALING_LADDER,
} from "./constants.js";
export { canEnterHealing, decide } from "./decide.js";
export type { HealDecision } from "./decide.js";
export { applyPatch, rollbackPatch, verifyHeal } from "./patch.js";
export type { AppliedPatch, PatchPlan, VerificationResult } from "./patch.js";
export { fingerprintAnchor, ladderCandidate, scoreCandidates } from "./score.js";
export type { RawCandidate, ScoreInput } from "./score.js";
export { applyVetoes, assertionStepMayReceivePatch } from "./vetoes.js";
export type { VetoContext, VetoResult } from "./vetoes.js";
