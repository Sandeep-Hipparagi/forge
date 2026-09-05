import type { CapabilityMap } from "./perception.js";
import type { TestPlan } from "./plan.js";

export type GroundingIssue = {
  scenarioId: string;
  stepId: string;
  code: "UNKNOWN_STATE" | "UNKNOWN_AFFORDANCE" | "NAVIGATE_HAS_AFFORDANCE";
  reference: string;
};

/** Return every unresolved state/affordance reference without mutating the plan. */
export function groundingIssues(plan: TestPlan, map: CapabilityMap): GroundingIssue[] {
  const stateIds = new Set(map.states.map((state) => state.id));
  const affordanceByRef = new Map(
    map.affordances.map((affordance) => [`${affordance.stateId}:${affordance.ref}`, affordance.id]),
  );
  const issues: GroundingIssue[] = [];

  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (!stateIds.has(step.stateId)) {
        issues.push({
          scenarioId: scenario.id,
          stepId: step.id,
          code: "UNKNOWN_STATE",
          reference: step.stateId,
        });
        continue;
      }
      if (step.kind === "navigate") {
        if (step.affordanceRef !== null) {
          issues.push({
            scenarioId: scenario.id,
            stepId: step.id,
            code: "NAVIGATE_HAS_AFFORDANCE",
            reference: step.affordanceRef,
          });
        }
        continue;
      }
      if (
        step.affordanceRef === null ||
        !affordanceByRef.has(`${step.stateId}:${step.affordanceRef}`)
      ) {
        issues.push({
          scenarioId: scenario.id,
          stepId: step.id,
          code: "UNKNOWN_AFFORDANCE",
          reference: step.affordanceRef ?? "",
        });
      }
    }
  }

  return issues;
}

/** Return true only when every plan step is grounded in the observed map. */
export function isGrounded(plan: TestPlan, map: CapabilityMap): boolean {
  return groundingIssues(plan, map).length === 0;
}
