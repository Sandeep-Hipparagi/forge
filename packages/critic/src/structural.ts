import type {
  TestPlan,
  CapabilitySubgraph,
  Affordance,
  Transition,
  ScenarioClass,
} from "@forge/core";
import type { StructuralCoverage } from "./types.js";

const WEIGHTS = {
  affordance: 0.3,
  transition: 0.25,
  state: 0.15,
  class: 0.2,
  assertion: 0.1,
} as const;

function eligibleAffordances(sub: CapabilitySubgraph): Affordance[] {
  return sub.affordances.filter((a) => a.enabled && !a.destructive);
}

function citedAffordanceRefs(plan: TestPlan): Set<string> {
  const refs = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (step.affordanceRef) refs.add(step.affordanceRef);
    }
  }
  return refs;
}

function citedTransitions(
  plan: TestPlan,
  sub: CapabilitySubgraph,
): Set<string> {
  const cited = new Set<string>();
  const subTransitions = new Map<string, Transition>();

  for (const t of sub.transitions) {
    const key = `${t.fromStateId}|${t.viaAffordanceId}|${t.toStateId}`;
    subTransitions.set(key, t);
  }

  for (const scenario of plan.scenarios) {
    const steps = [...scenario.steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < steps.length - 1; i++) {
      const step = steps[i];
      const nextStep = steps[i + 1];
      if (step?.affordanceRef && nextStep?.stateId) {
        const key = `${step.stateId}|${step.affordanceRef}|${nextStep.stateId}`;
        if (subTransitions.has(key)) {
          cited.add(key);
        }
      }
    }
  }
  return cited;
}

function citedStates(plan: TestPlan): Set<string> {
  const states = new Set<string>();
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      states.add(step.stateId);
    }
  }
  return states;
}

function presentClasses(plan: TestPlan): Set<ScenarioClass> {
  const classes = new Set<ScenarioClass>();
  for (const scenario of plan.scenarios) {
    classes.add(scenario.class);
  }
  return classes;
}

function countAssertions(plan: TestPlan): number {
  const assertionKinds = new Set([
    "assertText",
    "assertVisible",
    "assertUrl",
    "assertCount",
  ]);
  let count = 0;
  for (const scenario of plan.scenarios) {
    for (const step of scenario.steps) {
      if (assertionKinds.has(step.kind)) count++;
    }
  }
  return count;
}

export function structuralScore(
  plan: TestPlan,
  sub: CapabilitySubgraph,
): StructuralCoverage {
  const eligibleAffs = eligibleAffordances(sub);
  const citedAffRefs = citedAffordanceRefs(plan);
  const citedTrans = citedTransitions(plan, sub);
  const citedSts = citedStates(plan);
  const presentCls = presentClasses(plan);
  const assertionCount = countAssertions(plan);

  const affordanceNumerator = eligibleAffs.filter((a) =>
    citedAffRefs.has(a.ref),
  ).length;
  const affordanceDenominator = eligibleAffs.length;
  const affordanceRatio =
    affordanceDenominator > 0
      ? affordanceNumerator / affordanceDenominator
      : 1.0;

  const transitionNumerator = citedTrans.size;
  const transitionDenominator = sub.transitions.length;
  const transitionRatio =
    transitionDenominator > 0
      ? transitionNumerator / transitionDenominator
      : 1.0;

  const stateNumerator = citedSts.size;
  const stateDenominator = sub.states.length;
  const stateRatio =
    stateDenominator > 0 ? stateNumerator / stateDenominator : 1.0;

  const classNumerator = presentCls.size;
  const classDenominator = 4;
  const classRatio = classNumerator / classDenominator;

  const maxAssertions = plan.scenarios.length * 2;
  const assertionRatio =
    maxAssertions > 0 ? Math.min(1, assertionCount / maxAssertions) : 1.0;

  const score =
    Math.round(
      (WEIGHTS.affordance * affordanceRatio +
        WEIGHTS.transition * transitionRatio +
        WEIGHTS.state * stateRatio +
        WEIGHTS.class * classRatio +
        WEIGHTS.assertion * assertionRatio) *
        10000,
    ) / 10000;

  return {
    affordanceCoverage: affordanceRatio,
    transitionCoverage: transitionRatio,
    stateCoverage: stateRatio,
    classCoverage: classRatio,
    assertionDensity: assertionRatio,
    score,
    details: {
      affordances: {
        cited: affordanceNumerator,
        eligible: affordanceDenominator,
        ratio: affordanceRatio,
      },
      transitions: {
        cited: transitionNumerator,
        total: transitionDenominator,
        ratio: transitionRatio,
      },
      states: {
        cited: stateNumerator,
        total: stateDenominator,
        ratio: stateRatio,
      },
      classes: {
        present: classNumerator,
        total: classDenominator,
        ratio: classRatio,
      },
      assertions: {
        count: assertionCount,
        max: maxAssertions,
        ratio: assertionRatio,
      },
    },
  };
}
