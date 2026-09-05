import type { Affordance, ScenarioClass, State, Transition } from "../schema/index.js";

/**
 * The Critic's view of one capability — [10 §2.1](docs/03-algorithms/10-planner.md).
 * Not a Zod schema; composed from frozen perception types.
 */
export type CapabilitySubgraph = {
  states: Array<Pick<State, "id" | "signature" | "url" | "title">>;
  transitions: Transition[];
  affordances: Affordance[];
  entryStateId: string;
  exitConditions: string[];
};

export type TermFraction = {
  numerator: number;
  denominator: number;
  /** Ratio in [0, 1]; empty denominator scores 1.0. */
  ratio: number;
};

export type StructuralCoverage = {
  score: number;
  affordances: TermFraction;
  transitions: TermFraction;
  states: TermFraction;
  classes: TermFraction & { present: ScenarioClass[] };
  assertions: {
    assertionSteps: number;
    scenarios: number;
    /** min(1, assertionSteps / (2 · scenarios)). */
    density: number;
  };
};

export type ClassGapsOptions = {
  /** FR-203 escape hatch — keyword match on missing class names ([11 §5.3](docs/03-algorithms/11-coverage-critic.md)). */
  rationale?: string;
};
