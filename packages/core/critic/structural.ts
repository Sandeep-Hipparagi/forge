import { ASSERTION_KINDS, type ScenarioClass, type TestPlan } from "../schema/index.js";
import { CLASS_COUNT, WEIGHTS } from "./constants.js";
import type { CapabilitySubgraph, StructuralCoverage, TermFraction } from "./types.js";

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number): TermFraction {
  if (denominator === 0) return { numerator, denominator, ratio: 1 };
  return { numerator, denominator, ratio: numerator / denominator };
}

/** Eligible for the affordance denominator — enabled and not destructive ([11 §3.2](docs/03-algorithms/11-coverage-critic.md)). */
export function eligibleAffordances(sub: CapabilitySubgraph) {
  return sub.affordances.filter((a) => a.enabled && !a.destructive);
}

function citedAffordanceRefs(plan: TestPlan): Set<string> {
  const refs = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (step.affordanceRef !== null) refs.add(step.affordanceRef);
    }
  }
  return refs;
}

function citedStateIds(plan: TestPlan): Set<string> {
  const ids = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) ids.add(step.stateId);
  }
  return ids;
}

function presentClasses(plan: TestPlan): ScenarioClass[] {
  const present = new Set<ScenarioClass>();
  for (const scenario of plan.scenarios) present.add(scenario.class);
  return [...present].sort();
}

/**
 * Transitions implied by consecutive steps that also exist in the subgraph.
 * A step that does not change state covers no transition ([11 §3.2](docs/03-algorithms/11-coverage-critic.md)).
 */
export function traversedTransitionIds(plan: TestPlan, sub: CapabilitySubgraph): Set<string> {
  const byKey = new Map<string, string>();
  for (const t of sub.transitions) {
    const aff = sub.affordances.find((a) => a.id === t.viaAffordanceId);
    if (!aff) continue;
    byKey.set(`${t.fromStateId}|${aff.ref}|${t.toStateId}`, t.id);
  }

  const hit = new Set<string>();
  for (const scenario of plan.scenarios) {
    const steps = [...scenario.steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < steps.length - 1; i++) {
      const from = steps[i]!;
      const to = steps[i + 1]!;
      if (from.stateId === to.stateId) continue;
      if (from.affordanceRef === null) continue;
      const id = byKey.get(`${from.stateId}|${from.affordanceRef}|${to.stateId}`);
      if (id) hit.add(id);
    }
  }
  return hit;
}

function countAssertionSteps(plan: TestPlan): number {
  const kinds = new Set<string>(ASSERTION_KINDS);
  let n = 0;
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (kinds.has(step.kind)) n += 1;
    }
  }
  return n;
}

/**
 * Five-term structural coverage score — [11 §3](docs/03-algorithms/11-coverage-critic.md).
 * Pure; bit-reproducible from stored inputs.
 */
export function structuralScore(plan: TestPlan, sub: CapabilitySubgraph): StructuralCoverage {
  const eligible = eligibleAffordances(sub);
  const cited = citedAffordanceRefs(plan);
  const eligibleRefs = new Set(eligible.map((a) => a.ref));
  let exercised = 0;
  for (const ref of cited) {
    if (eligibleRefs.has(ref)) exercised += 1;
  }
  const affordances = ratio(exercised, eligible.length);

  const traversed = traversedTransitionIds(plan, sub);
  const transitions = ratio(traversed.size, sub.transitions.length);

  const reached = citedStateIds(plan);
  const stateIds = new Set(sub.states.map((s) => s.id));
  let statesReached = 0;
  for (const id of reached) {
    if (stateIds.has(id)) statesReached += 1;
  }
  const states = ratio(statesReached, sub.states.length);

  const present = presentClasses(plan);
  const classes = { ...ratio(present.length, CLASS_COUNT), present };

  const assertionSteps = countAssertionSteps(plan);
  const scenarioCount = plan.scenarios.length;
  const density = scenarioCount === 0 ? 1 : Math.min(1, assertionSteps / (2 * scenarioCount));

  const score = round4(
    WEIGHTS.affordance * affordances.ratio +
      WEIGHTS.transition * transitions.ratio +
      WEIGHTS.state * states.ratio +
      WEIGHTS.class * classes.ratio +
      WEIGHTS.assertion * density,
  );

  return {
    score,
    affordances,
    transitions,
    states,
    classes,
    assertions: { assertionSteps, scenarios: scenarioCount, density },
  };
}
