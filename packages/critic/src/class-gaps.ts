import type { TestPlan, CapabilitySubgraph, ScenarioClass } from "@forge/core";
import type { Gap as GapType } from "./types.js";

function findEntryState(
  sub: CapabilitySubgraph,
): CapabilitySubgraph["states"][number] | undefined {
  return sub.states.find((s) => s.id === sub.entryStateId);
}

function findExitStates(sub: CapabilitySubgraph): CapabilitySubgraph["states"] {
  return sub.states.filter((s) =>
    sub.exitConditions.some((ec) => s.title.includes(ec) || s.url.includes(ec)),
  );
}

function isPrimaryFlowCovered(
  plan: TestPlan,
  sub: CapabilitySubgraph,
): boolean {
  const entryState = findEntryState(sub);
  if (!entryState) return false;

  const exitStates = findExitStates(sub);
  if (exitStates.length === 0) return false;

  for (const scenario of plan.scenarios) {
    if (scenario.class !== "happy") continue;

    const steps = [...scenario.steps].sort((a, b) => a.order - b.order);
    if (steps.length === 0) continue;

    const firstStep = steps[0];
    if (!firstStep || firstStep.stateId !== entryState.id) continue;

    const lastStep = steps[steps.length - 1];
    if (!lastStep) continue;
    const reachesExit = exitStates.some((es) => es.id === lastStep.stateId);
    if (reachesExit) return true;
  }
  return false;
}

function countUntouchedAffordancesInState(
  stateId: string,
  plan: TestPlan,
  sub: CapabilitySubgraph,
): number {
  const eligible = sub.affordances.filter(
    (a) => a.enabled && !a.destructive && a.stateId === stateId,
  );
  const citedRefs = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (step.affordanceRef) citedRefs.add(step.affordanceRef);
    }
  }
  return eligible.filter((a) => !citedRefs.has(a.ref)).length;
}

function hasStatedReason(plan: TestPlan, className: ScenarioClass): boolean {
  const keywords = [
    className.toLowerCase(),
    className.toLowerCase().replace("_", " "),
  ];
  for (const scenario of plan.scenarios) {
    if (scenario.rationale) {
      const lower = scenario.rationale.toLowerCase();
      if (keywords.some((k) => lower.includes(k))) {
        return true;
      }
    }
  }
  return false;
}

export function classGaps(plan: TestPlan, sub: CapabilitySubgraph): GapType[] {
  const gaps: GapType[] = [];
  const presentClasses = new Set(plan.scenarios.map((s) => s.class));

  if (!presentClasses.has("negative") && !hasStatedReason(plan, "negative")) {
    gaps.push({
      id: "gap_class_negative",
      class: "MISSING_EDGE_CASE",
      title: "No negative scenario",
      why: "No scenario with class 'negative' and no stated reason in plan rationale",
      severity: "BLOCKER",
      suggestedScenario:
        "Add a negative case (e.g., empty required field, invalid input)",
      affordanceRefs: [],
    });
  }

  if (
    !presentClasses.has("error_state") &&
    !hasStatedReason(plan, "error_state")
  ) {
    gaps.push({
      id: "gap_class_error_state",
      class: "MISSING_ERROR_STATE",
      title: "No error-state scenario",
      why: "No scenario with class 'error_state' and no stated reason in plan rationale",
      severity: "BLOCKER",
      suggestedScenario:
        "Add an error-state case (e.g., validation error, decline, timeout)",
      affordanceRefs: [],
    });
  }

  if (!presentClasses.has("boundary") && !hasStatedReason(plan, "boundary")) {
    gaps.push({
      id: "gap_class_boundary",
      class: "MISSING_EDGE_CASE",
      title: "No boundary scenario",
      why: "No scenario with class 'boundary' and no stated reason in plan rationale",
      severity: "MAJOR",
      suggestedScenario:
        "Add a boundary case (e.g., max length, zero, duplicate)",
      affordanceRefs: [],
    });
  }

  if (!isPrimaryFlowCovered(plan, sub)) {
    gaps.push({
      id: "gap_flow_primary",
      class: "MISSING_FLOW",
      title: "Primary flow not covered end-to-end",
      why: "No happy-path scenario reaches an exit condition from the entry state",
      severity: "BLOCKER",
      suggestedScenario: "Ensure at least one happy path covers entry to exit",
      affordanceRefs: [],
    });
  }

  for (const state of sub.states) {
    const untouchedCount = countUntouchedAffordancesInState(
      state.id,
      plan,
      sub,
    );
    if (untouchedCount >= 3) {
      gaps.push({
        id: `gap_state_${state.id}`,
        class: "MISSING_FLOW",
        title: `${untouchedCount} untouched affordances in ${state.title}`,
        why: `A group of ${untouchedCount} eligible affordances in state ${state.id} are not cited by any scenario`,
        severity: "MAJOR",
        suggestedScenario: `Cover the untouched affordances in ${state.title}`,
        affordanceRefs: [],
      });
    } else if (untouchedCount === 1 || untouchedCount === 2) {
      for (const aff of sub.affordances.filter(
        (a) => a.stateId === state.id && a.enabled && !a.destructive,
      )) {
        const citedRefs = new Set<string>();
        for (const scenario of plan.scenarios) {
          for (const step of scenario.steps) {
            if (step.affordanceRef) citedRefs.add(step.affordanceRef);
          }
        }
        if (!citedRefs.has(aff.ref)) {
          gaps.push({
            id: `gap_aff_${aff.ref}`,
            class: "MISSING_FLOW",
            title: `Untouched affordance: ${aff.accessibleName ?? aff.role}`,
            why: `Eligible affordance ${aff.ref} in state ${state.id} is not cited by any scenario`,
            severity: "MINOR",
            suggestedScenario: `Add a step exercising ${aff.accessibleName ?? aff.role}`,
            affordanceRefs: [aff.ref],
          });
        }
      }
    }
  }

  for (const state of sub.states) {
    const cited = plan.scenarios.some((s) =>
      s.steps.some((step) => step.stateId === state.id),
    );
    if (!cited) {
      gaps.push({
        id: `gap_unreached_${state.id}`,
        class: "MISSING_FLOW",
        title: `Unreached state: ${state.title}`,
        why: `Observed state ${state.id} is not cited by any scenario`,
        severity: "MAJOR",
        suggestedScenario: `Add a scenario that visits ${state.title}`,
        affordanceRefs: [],
      });
    }
  }

  for (const aff of sub.affordances) {
    if (aff.destructive && aff.observedNotExercised) {
      gaps.push({
        id: `gap_destructive_${aff.ref}`,
        class: "MISSING_FLOW",
        title: `Deny-listed affordance not exercised: ${aff.accessibleName ?? aff.role}`,
        why: `Destructive affordance ${aff.ref} was observed but not exercised (reason: ${aff.notExercisedReason})`,
        severity: "MINOR",
        suggestedScenario: `Mark target disposable to exercise ${aff.accessibleName ?? aff.role}`,
        affordanceRefs: [aff.ref],
      });
    }
  }

  return gaps;
}
