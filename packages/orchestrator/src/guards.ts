import {
  CapabilityMap,
  TestPlan,
  isGrounded,
  type Capability,
  type CoverageAssessment,
  type Diagnosis,
  type Lap,
  type Run,
  type SessionStatus,
} from "@forge/core";

export const MAX_REPLAN_ROUNDS = 2;
export const MAX_STEP_HEALS = 2;
export const MAX_CAPABILITY_HEALS = 3;

export type GuardResult<T> = { allowed: true; value: T } | { allowed: false; reason: string };

export function tg1CanExplore(rawUrl: string, allowedHosts: readonly string[]): GuardResult<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "URL is invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "Only http(s) targets are allowed" };
  }
  if (
    allowedHosts.length > 0 &&
    !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  ) {
    return { allowed: false, reason: "Target host is outside the allowlist" };
  }
  return { allowed: true, value: url };
}

export function tg2PrepareMap(input: CapabilityMap): GuardResult<CapabilityMap> {
  if (input.states.length === 0) {
    return { allowed: false, reason: "Exploration did not produce an entry state" };
  }
  if (input.states.some(({ signature }) => signature.length !== 16)) {
    return { allowed: false, reason: "Every state must carry a signature" };
  }
  if (input.capabilities.length > 0) return { allowed: true, value: input };

  const entry = input.states[0]!;
  return {
    allowed: true,
    value: {
      ...input,
      capabilities: [
        {
          id: `cap_${entry.signature.slice(0, 8)}`,
          sessionId: input.sessionId,
          name: "Entry flow",
          description: "Synthetic capability for the explored entry state",
          entryStateId: entry.id,
          stateIds: [entry.id],
          exitConditions: ["Entry state remains reachable"],
          dependsOn: [],
          risk: {
            score: 0,
            factors: {
              authProximity: 0,
              dataMutation: 0,
              moneyOrPii: 0,
              graphCentrality: 0,
              affordanceDensity: 0,
              statedIntent: 0,
            },
          },
          priorityRank: 0,
        },
      ],
    },
  };
}

export function tg3OrderBacklog(capabilities: readonly Capability[]): Capability[] {
  return [...capabilities].sort(
    (left, right) => left.priorityRank - right.priorityRank || left.id.localeCompare(right.id),
  );
}

export function tg4DependenciesBanked(
  capability: Capability,
  bankedCapabilityIds: ReadonlySet<string>,
): boolean {
  return capability.dependsOn.every((id) => bankedCapabilityIds.has(id));
}

export function tg5aPlanIsGrounded(plan: unknown, map: CapabilityMap): GuardResult<TestPlan> {
  const parsed = TestPlan.safeParse(plan);
  if (!parsed.success) return { allowed: false, reason: "Plan is not schema-valid" };
  if (!isGrounded(parsed.data, map)) {
    return { allowed: false, reason: "Plan cites an unobserved state or affordance" };
  }
  return { allowed: true, value: parsed.data };
}

export type CritiqueTransition =
  | { next: "GENERATING"; acceptedRisk: CoverageAssessment["gaps"] }
  | {
      next: "PLANNING";
      carry: CoverageAssessment["gaps"];
      replanRounds: number;
    };

export function tg5bOrTg6AfterCritique(
  lap: Pick<Lap, "replanRounds">,
  assessment: CoverageAssessment | null,
): GuardResult<CritiqueTransition> {
  if (assessment === null) {
    return { allowed: false, reason: "A current coverage assessment is required" };
  }
  const blocked =
    assessment.gaps.some(({ severity }) => severity === "BLOCKER") ||
    assessment.score < assessment.floor;
  if (!blocked) {
    return { allowed: true, value: { next: "GENERATING", acceptedRisk: [] } };
  }
  if (lap.replanRounds < MAX_REPLAN_ROUNDS) {
    return {
      allowed: true,
      value: {
        next: "PLANNING",
        carry: assessment.gaps,
        replanRounds: lap.replanRounds + 1,
      },
    };
  }
  return {
    allowed: true,
    value: { next: "GENERATING", acceptedRisk: assessment.gaps },
  };
}

export type GeneratedScenarioValidation = {
  scenarioId: string;
  resolvedCounts: readonly number[];
  assertionsPassed: boolean;
};

export function tg7RunnableScenarios(scenarios: readonly GeneratedScenarioValidation[]): {
  runnable: string[];
  dropped: string[];
} {
  const runnable: string[] = [];
  const dropped: string[] = [];
  for (const scenario of scenarios) {
    const valid =
      scenario.assertionsPassed &&
      scenario.resolvedCounts.every((resolvedCount) => resolvedCount === 1);
    (valid ? runnable : dropped).push(scenario.scenarioId);
  }
  return { runnable, dropped };
}

const TERMINAL_RUN_STATUSES = new Set<Run["status"]>([
  "VERIFIED",
  "FAIL_WITH_EVIDENCE",
  "ESCALATED",
  "FLAKY",
  "ERROR",
]);

export function tg8AllRunsTerminal(runs: readonly Pick<Run, "status">[]): boolean {
  return runs.length > 0 && runs.every(({ status }) => TERMINAL_RUN_STATUSES.has(status));
}

export function tg9CanHeal(
  diagnosis: Pick<Diagnosis, "kind" | "vetoes">,
  stepAttempts: number,
  capabilityAttempts: number,
): boolean {
  return (
    diagnosis.kind === "LOCATOR_BREAK" &&
    diagnosis.vetoes.length === 0 &&
    stepAttempts < MAX_STEP_HEALS &&
    capabilityAttempts < MAX_CAPABILITY_HEALS
  );
}

export function tg10Verified(verification: Run["verification"]): GuardResult<"BANKED"> {
  if (verification.healedStepRerun && verification.fullFlowRerun) {
    return { allowed: true, value: "BANKED" };
  }
  return {
    allowed: false,
    reason: "Both healed-step and full-flow verification are required",
  };
}

export function tg11ReportingOutcome(
  backlogRemaining: number,
  budgetExhausted: boolean,
): GuardResult<SessionStatus> {
  if (backlogRemaining > 0 && !budgetExhausted) {
    return { allowed: false, reason: "Capability backlog is not empty" };
  }
  return {
    allowed: true,
    value: budgetExhausted ? "COMPLETED_PARTIAL" : "COMPLETED",
  };
}

export function exitCodeFor(status: SessionStatus, defectsFound: number): 0 | 1 | 2 | 3 {
  if (status === "ERROR") return 3;
  if (status === "ESCALATED") return 2;
  if (status === "COMPLETED" || status === "COMPLETED_PARTIAL") {
    return defectsFound > 0 ? 1 : 0;
  }
  return 0;
}
