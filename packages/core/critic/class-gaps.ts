import type { Gap, TestPlan } from "../schema/index.js";
import { eligibleAffordances } from "./structural.js";
import type { CapabilitySubgraph, ClassGapsOptions } from "./types.js";

function gapId(index: number): string {
  return `gap_${String(index).padStart(8, "0")}`;
}

function mentionsClass(rationale: string | undefined, token: string): boolean {
  if (!rationale) return false;
  const normalised = rationale.toLowerCase().replace(/_/g, " ");
  return normalised.includes(token.toLowerCase().replace(/_/g, " "));
}

function sinkStateIds(sub: CapabilitySubgraph): Set<string> {
  const hasOutgoing = new Set(sub.transitions.map((t) => t.fromStateId));
  return new Set(sub.states.filter((s) => !hasOutgoing.has(s.id)).map((s) => s.id));
}

function primaryFlowCovered(plan: TestPlan, sub: CapabilitySubgraph): boolean {
  const sinks = sinkStateIds(sub);
  if (sinks.size === 0) {
    // No sink — treat any scenario that leaves the entry state as covering a flow.
    return plan.scenarios.some((scenario) =>
      scenario.steps.some((step) => step.stateId !== sub.entryStateId),
    );
  }
  return plan.scenarios.some((scenario) => {
    const states = new Set(scenario.steps.map((s) => s.stateId));
    const startsAtEntry = scenario.steps.some((s) => s.stateId === sub.entryStateId);
    const reachesSink = [...sinks].some((id) => states.has(id));
    return startsAtEntry && reachesSink;
  });
}

/**
 * Deterministic gap minting — [11 §5.3](docs/03-algorithms/11-coverage-critic.md).
 * Only this half may emit `BLOCKER` severity ([ADR-017](docs/decisions/ADR-017-arithmetic-blocks.md)).
 */
export function classGaps(
  plan: TestPlan,
  sub: CapabilitySubgraph,
  options: ClassGapsOptions = {},
): Gap[] {
  const gaps: Gap[] = [];
  let next = 1;
  const push = (gap: Omit<Gap, "id">) => {
    gaps.push({ id: gapId(next++), ...gap });
  };

  const classes = new Set(plan.scenarios.map((s) => s.class));
  const rationale = options.rationale;

  if (!classes.has("negative") && !mentionsClass(rationale, "negative")) {
    push({
      class: "MISSING_EDGE_CASE",
      title: "No negative-class scenario",
      why: "A required scenario class is absent with no stated reason in the plan rationale.",
      severity: "BLOCKER",
      suggestedScenario: "Add a negative case that exercises a rejected or empty input.",
      affordanceRefs: [],
    });
  }

  if (!classes.has("error_state") && !mentionsClass(rationale, "error_state")) {
    push({
      class: "MISSING_ERROR_STATE",
      title: "No error-state scenario",
      why: "Nothing triggers an application refusal (validation, decline, permission, timeout).",
      severity: "BLOCKER",
      suggestedScenario: "Add a scenario that provokes an error or denial response.",
      affordanceRefs: [],
    });
  }

  if (!classes.has("boundary") && !mentionsClass(rationale, "boundary")) {
    push({
      class: "MISSING_EDGE_CASE",
      title: "No boundary-class scenario",
      why: "Boundary inputs (empty, maximum, duplicate) are unprobed.",
      severity: "MAJOR",
      suggestedScenario: "Add a boundary case on the longest required text field.",
      affordanceRefs: [],
    });
  }

  if (!primaryFlowCovered(plan, sub)) {
    push({
      class: "MISSING_FLOW",
      title: "Primary flow uncovered",
      why: `No scenario covers a path from entry ${sub.entryStateId} to an exit condition.`,
      severity: "BLOCKER",
      suggestedScenario: "Walk the shortest observed path from entry to an exit state.",
      affordanceRefs: [],
    });
  }

  const cited = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (step.affordanceRef !== null) cited.add(step.affordanceRef);
    }
  }

  const eligible = eligibleAffordances(sub);
  const untouchedByState = new Map<string, string[]>();
  for (const aff of eligible) {
    if (cited.has(aff.ref)) continue;
    const list = untouchedByState.get(aff.stateId) ?? [];
    list.push(aff.ref);
    untouchedByState.set(aff.stateId, list);
  }

  for (const [stateId, refs] of [...untouchedByState.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (refs.length >= 3) {
      push({
        class: "MISSING_FLOW",
        title: `${refs.length} affordances in ${stateId} are untouched`,
        why: `A connected group of eligible affordances shares parent state ${stateId}.`,
        severity: "MAJOR",
        suggestedScenario: `Cover the untouched group in ${stateId}: ${refs.slice(0, 5).join(", ")}.`,
        affordanceRefs: refs,
      });
    } else {
      for (const ref of refs) {
        push({
          class: "MISSING_FLOW",
          title: `Untouched affordance ${ref}`,
          why: `Eligible affordance ${ref} in ${stateId} is cited by no scenario.`,
          severity: "MINOR",
          suggestedScenario: `Add a step that exercises ${ref}.`,
          affordanceRefs: [ref],
        });
      }
    }
  }

  const citedStates = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) citedStates.add(step.stateId);
  }
  for (const state of sub.states) {
    if (!citedStates.has(state.id)) {
      push({
        class: "MISSING_FLOW",
        title: `Unreached state ${state.id}`,
        why: `Observed state "${state.title}" is cited by no scenario.`,
        severity: "MAJOR",
        suggestedScenario: `Navigate to ${state.title} (${state.id}).`,
        affordanceRefs: [],
      });
    }
  }

  for (const aff of sub.affordances) {
    if (aff.destructive && aff.observedNotExercised) {
      push({
        class: "MISSING_FLOW",
        title: `Destructive affordance ${aff.ref} untested`,
        why: aff.notExercisedReason ?? "Deny-listed destructive affordance recorded as untested.",
        severity: "MINOR",
        suggestedScenario: `Plan (plannedNotGenerated) a scenario for ${aff.accessibleName ?? aff.ref}.`,
        affordanceRefs: [aff.ref],
      });
    }
  }

  return gaps;
}
