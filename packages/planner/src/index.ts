import type {
  TestPlan,
  Scenario,
  TestStep,
  CapabilitySubgraph,
  Affordance,
  Capability,
} from "@forge/core";
import {
  identityKey,
  mergeScenarios,
  ground,
  applyPriorityCeiling,
  computePriorityCeiling,
} from "./grounding.js";
import { renderPlan } from "./plan-md.js";

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

function buildAffordanceMap(sub: CapabilitySubgraph): Map<string, Affordance> {
  const map = new Map<string, Affordance>();
  for (const aff of sub.affordances) {
    map.set(aff.ref, aff);
  }
  return map;
}

export function fallbackPlan(
  sub: CapabilitySubgraph,
  capability: Capability,
): TestPlan {
  const entryState = findEntryState(sub);
  const exitStates = findExitStates(sub);
  const affordanceMap = buildAffordanceMap(sub);
  const scenarios: Scenario[] = [];
  let scenarioCounter = 1;

  if (!entryState) {
    return emptyPlan(capability);
  }

  const exitState = exitStates[0];
  const path = findShortestPath(
    entryState.id,
    exitState?.id ?? entryState.id,
    sub,
  );

  if (path.length > 0) {
    scenarios.push(
      buildScenarioFromPath(
        path,
        "happy",
        capability,
        scenarioCounter++,
        sub,
        affordanceMap,
      ),
    );
    scenarios.push(
      buildScenarioFromPath(
        path,
        "negative",
        capability,
        scenarioCounter++,
        sub,
        affordanceMap,
        true,
      ),
    );
    scenarios.push(
      buildScenarioFromPath(
        path,
        "boundary",
        capability,
        scenarioCounter++,
        sub,
        affordanceMap,
        false,
        true,
      ),
    );
    const errorState = sub.states.find((s) =>
      /error|not found|unavailable|denied/i.test(s.title),
    );
    if (errorState) {
      scenarios.push(
        buildErrorScenario(errorState, capability, scenarioCounter++),
      );
    }
  }

  const mergedScenarios = mergeScenarios([], scenarios);

  return {
    id: `pln_${capability.id}_fallback`,
    lapId: "",
    capabilityId: capability.id,
    round: 0,
    scenarios: mergedScenarios,
    markdownPath: "",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

function emptyPlan(capability: Capability): TestPlan {
  return {
    id: `pln_${capability.id}_empty`,
    lapId: "",
    capabilityId: capability.id,
    round: 0,
    scenarios: [],
    markdownPath: "",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

function findShortestPath(
  fromId: string,
  toId: string,
  sub: CapabilitySubgraph,
): CapabilitySubgraph["states"] {
  if (fromId === toId) {
    const s = sub.states.find((st) => st.id === fromId);
    return s ? [s] : [];
  }

  const graph = new Map<string, Set<string>>();
  for (const trans of sub.transitions) {
    if (!graph.has(trans.fromStateId)) graph.set(trans.fromStateId, new Set());
    graph.get(trans.fromStateId)!.add(trans.toStateId);
  }

  const queue: Array<{ stateId: string; path: string[] }> = [
    { stateId: fromId, path: [fromId] },
  ];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { stateId, path } = item;
    if (stateId === toId) {
      return path
        .map((id) => sub.states.find((s) => s.id === id))
        .filter((s): s is CapabilitySubgraph["states"][number] => Boolean(s));
    }
    const neighbors = graph.get(stateId);
    if (neighbors) {
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push({ stateId: n, path: [...path, n] });
        }
      }
    }
  }
  return [];
}

function buildScenarioFromPath(
  path: CapabilitySubgraph["states"],
  className: "happy" | "negative" | "boundary" | "error_state",
  capability: Capability,
  scenarioNum: number,
  sub: CapabilitySubgraph,
  affordanceMap: Map<string, Affordance>,
  isNegative = false,
  isBoundary = false,
): Scenario {
  const steps: TestStep[] = [];
  let stepOrder = 0;

  for (let i = 0; i < path.length; i++) {
    const state = path[i];
    if (!state) continue;

    if (i === 0) {
      steps.push({
        id: `s${stepOrder++}`,
        order: stepOrder - 1,
        kind: "navigate",
        targetIntent: `open ${state.title}`,
        stateId: state.id,
        affordanceRef: null,
        locator: null,
        input: null,
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount: null,
      });
    }

    if (i < path.length - 1) {
      const nextState = path[i + 1];
      if (nextState) {
        const trans = sub.transitions.find(
          (t) => t.fromStateId === state.id && t.toStateId === nextState.id,
        );
        if (trans) {
          const aff = affordanceMap.get(trans.viaAffordanceId);
          if (aff) {
            steps.push({
              id: `s${stepOrder++}`,
              order: stepOrder - 1,
              kind: aff.kind === "textbox" ? "fill" : "click",
              targetIntent: isNegative
                ? `leave ${aff.accessibleName ?? aff.role} empty`
                : isBoundary
                  ? `fill ${aff.accessibleName ?? aff.role} with max length`
                  : `click ${aff.accessibleName ?? aff.role}`,
              stateId: state.id,
              affordanceRef: aff.ref,
              locator: null,
              locatorStrategy: "role_name",
              locatorArgs: { role: aff.role, name: aff.accessibleName },
              input: isBoundary ? "x".repeat(256) : isNegative ? "" : "test",
              timeoutMs: 5000,
              optional: false,
              fingerprintId: null,
              resolvedCount: null,
            });
          }
        }
      }
    }

    if (i === path.length - 1) {
      steps.push({
        id: `s${stepOrder++}`,
        order: stepOrder - 1,
        kind: "assertVisible",
        targetIntent: isNegative
          ? "form does not advance"
          : "success state visible",
        stateId: state.id,
        affordanceRef: null,
        locator: null,
        input: isNegative ? "unchanged" : "heading visible",
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount: null,
      });
    }
  }

  const titles = {
    happy: "Happy path",
    negative: "Negative case",
    boundary: "Boundary case",
    error_state: "Error state",
  };

  return {
    id: `SC-${String(scenarioNum).padStart(3, "0")}`,
    planId: "",
    title: `${titles[className]}`,
    class: className,
    priority: "P0",
    priorityReason: "fallback",
    preconditions: [],
    steps,
    expectedOutcome: isNegative
      ? "Form does not advance"
      : isBoundary
        ? "Handles max length"
        : "Success state reached",
    source: "agent",
    sourceRefs: [],
    plannedNotGenerated: false,
    notGeneratedReason: null,
    version: 1,
    rationale: `Deterministic fallback for ${className} class`,
  };
}

function buildErrorScenario(
  errorState: CapabilitySubgraph["states"][number],
  capability: Capability,
  scenarioNum: number,
): Scenario {
  const steps: TestStep[] = [
    {
      id: "s0",
      order: 0,
      kind: "navigate",
      targetIntent: `navigate to error state`,
      stateId: errorState.id,
      affordanceRef: null,
      locator: null,
      input: null,
      timeoutMs: 5000,
      optional: false,
      fingerprintId: null,
      resolvedCount: null,
    },
    {
      id: "s1",
      order: 1,
      kind: "assertVisible",
      targetIntent: "error message visible",
      stateId: errorState.id,
      affordanceRef: null,
      locator: null,
      input: "error visible",
      timeoutMs: 5000,
      optional: false,
      fingerprintId: null,
      resolvedCount: null,
    },
  ];

  return {
    id: `SC-${String(scenarioNum).padStart(3, "0")}`,
    planId: "",
    title: "Error state",
    class: "error_state",
    priority: "P0",
    priorityReason: "fallback",
    preconditions: [],
    steps,
    expectedOutcome: "Error message is displayed",
    source: "agent",
    sourceRefs: [],
    plannedNotGenerated: false,
    notGeneratedReason: null,
    version: 1,
    rationale: "Deterministic fallback for error_state class",
  };
}

export {
  identityKey,
  mergeScenarios,
  ground,
  applyPriorityCeiling,
  computePriorityCeiling,
  renderPlan,
};
export type { GroundingResult } from "./types.js";
