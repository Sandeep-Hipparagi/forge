import type {
  Capability,
  CoverageAssessment,
  Lap,
  TestPlan,
} from "@forge/core";

export type CritiqueTransition =
  | { next: "GENERATING"; acceptedRisk: false }
  | { next: "GENERATING"; acceptedRisk: true }
  | { next: "PLANNING"; replanRounds: number };

export const canStartSession = (
  url: string,
  allowedHosts: string[],
): boolean => {
  const target = new URL(url);
  return (
    ["http:", "https:"].includes(target.protocol) &&
    allowedHosts.includes(target.hostname)
  );
};

export const canStartLap = (
  capability: Capability,
  bankedCapabilityIds: ReadonlySet<string>,
): boolean => capability.dependsOn.every((id) => bankedCapabilityIds.has(id));

export const planIsGrounded = (
  plan: TestPlan,
  stateIds: ReadonlySet<string>,
  affordanceRefs: ReadonlySet<string>,
): boolean =>
  plan.scenarios.every((scenario) =>
    scenario.steps.every(
      (step) =>
        stateIds.has(step.stateId) &&
        (step.kind === "navigate"
          ? step.affordanceRef === null
          : step.affordanceRef !== null &&
            affordanceRefs.has(step.affordanceRef)),
    ),
  );

export const afterCritique = (
  lap: Lap,
  assessment: CoverageAssessment,
): CritiqueTransition => {
  const blocked = assessment.gaps.some((gap) => gap.severity === "BLOCKER");
  if (!blocked && assessment.score >= assessment.floor)
    return { next: "GENERATING", acceptedRisk: false };
  if (lap.replanRounds < 2)
    return { next: "PLANNING", replanRounds: lap.replanRounds + 1 };
  return { next: "GENERATING", acceptedRisk: true };
};

export const canHeal = (
  kind: string,
  vetoes: readonly string[],
  lap: Lap,
  stepId: string,
): boolean =>
  kind === "LOCATOR_BREAK" &&
  vetoes.length === 0 &&
  (lap.healAttempts[stepId] ?? 0) < 2 &&
  Object.values(lap.healAttempts).reduce(
    (total, attempts) => total + attempts,
    0,
  ) < 3;

export const exitCodeFor = (
  status: "COMPLETED" | "COMPLETED_PARTIAL" | "ESCALATED" | "ERROR",
  defectsFound: number,
): number => {
  if (status === "ERROR") return 3;
  if (status === "ESCALATED") return 2;
  return defectsFound > 0 ? 1 : 0;
};
