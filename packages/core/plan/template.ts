import type {
  Affordance,
  Scenario,
  ScenarioClass,
  TestPlan,
  TestStep,
  Transition,
} from "../schema/index.js";
import type { IdGen } from "../src/env.js";
import type { CapabilitySubgraph } from "../critic/types.js";

const ERROR_TITLE = /error|not found|unavailable|denied/i;

export type TemplatePlanMeta = {
  lapId: string;
  capabilityId: string;
  round: number;
  createdAt: string;
  markdownPath?: string;
};

export type TemplatePlanResult = {
  plan: TestPlan;
  /** FR-203 escape hatch text for classes that genuinely do not apply. */
  rationale: string;
};

type PathEdge = { transition: Transition; affordance: Affordance };

/** Shortest observed path from entry to a sink (or farthest reachable). */
function shortestPath(sub: CapabilitySubgraph): PathEdge[] {
  const affById = new Map(sub.affordances.map((a) => [a.id, a]));
  const outgoing = new Map<string, PathEdge[]>();
  for (const t of sub.transitions) {
    if (t.fromStateId === t.toStateId) continue;
    const aff = affById.get(t.viaAffordanceId);
    if (!aff || aff.destructive || !aff.enabled) continue;
    const list = outgoing.get(t.fromStateId) ?? [];
    list.push({ transition: t, affordance: aff });
    outgoing.set(t.fromStateId, list);
  }

  const hasOutgoing = new Set(outgoing.keys());
  const sinks = new Set(sub.states.filter((s) => !hasOutgoing.has(s.id)).map((s) => s.id));

  const queue: Array<{ id: string; path: PathEdge[] }> = [{ id: sub.entryStateId, path: [] }];
  const seen = new Set<string>([sub.entryStateId]);
  let farthest: PathEdge[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.path.length > farthest.length) farthest = cur.path;
    if (sinks.has(cur.id) && cur.path.length > 0) return cur.path;
    for (const edge of outgoing.get(cur.id) ?? []) {
      const next = edge.transition.toStateId;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, path: [...cur.path, edge] });
    }
  }
  return farthest;
}

function firstFillOnPath(path: PathEdge[]): Affordance | null {
  for (const edge of path) {
    if (edge.affordance.kind === "textbox") return edge.affordance;
  }
  return null;
}

function longestTextbox(sub: CapabilitySubgraph): Affordance | null {
  const boxes = sub.affordances.filter((a) => a.enabled && !a.destructive && a.kind === "textbox");
  return (
    boxes.sort((a, b) => (b.accessibleName?.length ?? 0) - (a.accessibleName?.length ?? 0))[0] ??
    null
  );
}

function errorState(sub: CapabilitySubgraph) {
  return sub.states.find((s) => ERROR_TITLE.test(s.title)) ?? null;
}

function makeStep(
  order: number,
  kind: TestStep["kind"],
  stateId: string,
  affordanceRef: string | null,
  intent: string,
  input: string | null = null,
): TestStep {
  return {
    id: `s${order + 1}`,
    order,
    kind,
    targetIntent: intent,
    stateId,
    affordanceRef,
    locator: null,
    input,
    timeoutMs: 5_000,
    optional: false,
    fingerprintId: null,
    resolvedCount: null,
  };
}

function pathSteps(path: PathEdge[], fillValue: string, affordances: Affordance[]): TestStep[] {
  const onState = (stateId: string) => affordances.filter((a) => a.stateId === stateId);
  const steps: TestStep[] = [];
  let order = 0;
  for (const edge of path) {
    const kind: TestStep["kind"] =
      edge.transition.action === "fill"
        ? "fill"
        : edge.transition.action === "select"
          ? "select"
          : edge.transition.action === "navigate"
            ? "navigate"
            : "click";
    steps.push(
      makeStep(
        order++,
        kind,
        edge.transition.fromStateId,
        kind === "navigate" ? null : edge.affordance.ref,
        `${kind} ${edge.affordance.accessibleName ?? edge.affordance.ref}`,
        kind === "fill" ? fillValue : null,
      ),
    );
  }
  if (path.length > 0) {
    const last = path[path.length - 1]!;
    const destState = last.transition.toStateId;
    const destAff = onState(destState).find((a) => a.enabled && !a.destructive) ?? last.affordance;
    steps.push(
      makeStep(
        order,
        "assertVisible",
        destState,
        destAff.ref,
        `assert visible on arrival at ${destState}`,
      ),
    );
  }
  return steps;
}

function entryAssert(sub: CapabilitySubgraph): TestStep[] {
  const any =
    sub.affordances.find((a) => a.stateId === sub.entryStateId && a.enabled && !a.destructive) ??
    null;
  return [
    makeStep(
      0,
      "assertVisible",
      sub.entryStateId,
      any?.ref ?? null,
      "entry state remains reachable",
    ),
  ];
}

function scenario(
  planId: string,
  id: string,
  title: string,
  cls: ScenarioClass,
  steps: TestStep[],
  expectedOutcome: string,
): Scenario {
  return {
    id,
    planId,
    title,
    class: cls,
    priority: cls === "happy" ? "P0" : "P2",
    priorityReason: `template ${cls}`,
    preconditions: [],
    steps,
    expectedOutcome,
    source: "agent",
    sourceRefs: [],
    plannedNotGenerated: false,
    notGeneratedReason: null,
    version: 1,
  };
}

/**
 * Affordance-derived fallback plan — [10 §9](docs/03-algorithms/10-planner.md).
 * Every step cites an observed affordance; no model required.
 */
export function templatePlan(
  sub: CapabilitySubgraph,
  ids: IdGen,
  meta: TemplatePlanMeta,
): TemplatePlanResult {
  const planId = ids.next("pln");
  const path = shortestPath(sub);
  const scenarios: Scenario[] = [];
  const rationaleParts: string[] = [];

  const happySteps = path.length > 0 ? pathSteps(path, "valid", sub.affordances) : entryAssert(sub);
  scenarios.push(
    scenario(planId, "SC-001", "Happy path to exit", "happy", happySteps, "Exit condition reached"),
  );

  const required = firstFillOnPath(path);
  if (required && path.length > 0) {
    const neg = pathSteps(path, "", sub.affordances);
    const firstFill = neg.find((s) => s.kind === "fill");
    if (firstFill) firstFill.input = "";
    neg.push(
      makeStep(
        neg.length,
        "assertUrl",
        sub.entryStateId,
        sub.affordances.find((a) => a.stateId === sub.entryStateId && a.enabled)?.ref ??
          required.ref,
        "form did not advance",
      ),
    );
    scenarios.push(
      scenario(
        planId,
        "SC-002",
        "Negative — required field left empty",
        "negative",
        neg,
        "Form does not advance when required input is empty",
      ),
    );
  } else {
    // Still emit a negative that reuses the happy path with assertUrl unchanged semantics
    const neg = [
      ...happySteps.slice(0, Math.max(1, happySteps.length - 1)),
      makeStep(
        Math.max(0, happySteps.length - 1),
        "assertUrl",
        sub.entryStateId,
        happySteps[0]?.affordanceRef ?? null,
        "did not leave entry unexpectedly",
      ),
    ];
    scenarios.push(
      scenario(
        planId,
        "SC-002",
        "Negative — flow does not skip ahead",
        "negative",
        neg,
        "Unexpected navigation is rejected",
      ),
    );
  }

  const longBox = longestTextbox(sub);
  if (longBox && path.length > 0) {
    scenarios.push(
      scenario(
        planId,
        "SC-003",
        "Boundary — longest textbox at 256 characters",
        "boundary",
        pathSteps(path, "x".repeat(256), sub.affordances),
        "Overlong input is handled without crashing",
      ),
    );
  } else if (longBox) {
    scenarios.push(
      scenario(
        planId,
        "SC-003",
        "Boundary — longest textbox at 256 characters",
        "boundary",
        [
          makeStep(0, "fill", longBox.stateId, longBox.ref, "fill to 256", "x".repeat(256)),
          makeStep(1, "assertVisible", longBox.stateId, longBox.ref, "field still visible"),
        ],
        "Overlong input is handled without crashing",
      ),
    );
  } else {
    rationaleParts.push("boundary: no textbox affordance observed");
  }

  const err = errorState(sub);
  if (err) {
    const link = sub.transitions.find((t) => t.toStateId === err.id);
    const aff = link ? sub.affordances.find((a) => a.id === link.viaAffordanceId) : null;
    const steps: TestStep[] =
      link && aff
        ? [
            makeStep(0, "click", link.fromStateId, aff.ref, `open ${err.title}`),
            makeStep(1, "assertVisible", err.id, aff.ref, "error state visible"),
          ]
        : [makeStep(0, "assertVisible", err.id, null, "error state observed")];
    scenarios.push(
      scenario(
        planId,
        "SC-004",
        `Error state — ${err.title}`,
        "error_state",
        steps,
        "Error state is reachable and visible",
      ),
    );
  } else {
    rationaleParts.push("error_state: none observed on this capability");
  }

  return {
    plan: {
      id: planId,
      lapId: meta.lapId,
      capabilityId: meta.capabilityId,
      round: meta.round,
      scenarios,
      markdownPath: meta.markdownPath ?? `plans/${meta.capabilityId}-r${meta.round}.md`,
      createdAt: meta.createdAt,
    },
    rationale: rationaleParts.join("; "),
  };
}
