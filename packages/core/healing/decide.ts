import { AMBIGUITY_MARGIN, AUTO_HEAL_GATE, FAIL_GATE } from "./constants.js";

export type HealDecision =
  | { kind: "AUTO_HEAL"; top: { locator: string; score: number }; margin: number }
  | { kind: "ESCALATE"; top: { locator: string; score: number }; margin: number }
  | { kind: "FAIL"; reason: string };

/**
 * Decision gates ([13 §9](docs/03-algorithms/13-triage-and-healing.md)).
 * Call only after vetoes; any veto short-circuits before this.
 */
export function decide(candidates: readonly { locator: string; score: number }[]): HealDecision {
  if (candidates.length === 0) {
    return { kind: "FAIL", reason: "No eligible candidates" };
  }
  const top = candidates[0]!;
  const runnerUp = candidates[1];
  const margin = runnerUp === undefined ? 1 : top.score - runnerUp.score;

  if (top.score >= AUTO_HEAL_GATE && margin > AMBIGUITY_MARGIN) {
    return { kind: "AUTO_HEAL", top, margin };
  }
  if (top.score >= FAIL_GATE) {
    return { kind: "ESCALATE", top, margin };
  }
  return { kind: "FAIL", reason: `Top score ${top.score} is below the ${FAIL_GATE} fail gate` };
}

/**
 * TG-9 three conditions for entering HEALING
 * ([04 §3.3](docs/02-architecture/04-system-architecture.md)):
 * 1. kind === LOCATOR_BREAK
 * 2. no veto fired
 * 3. heal caps available (step < 2, capability < 3)
 */
export function canEnterHealing(input: {
  kind: string;
  vetoes: readonly string[];
  stepAttempts: number;
  capabilityAttempts: number;
  maxStep?: number;
  maxCapability?: number;
}): boolean {
  const maxStep = input.maxStep ?? 2;
  const maxCapability = input.maxCapability ?? 3;
  return (
    input.kind === "LOCATOR_BREAK" &&
    input.vetoes.length === 0 &&
    input.stepAttempts < maxStep &&
    input.capabilityAttempts < maxCapability
  );
}
