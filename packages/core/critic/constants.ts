/** Blocking floor for structural coverage — [11 §4](docs/03-algorithms/11-coverage-critic.md). */
export const COVERAGE_FLOOR = 0.7;

/** Maximum re-plan rounds after the initial plan — `I-12`, [11 §7.2](docs/03-algorithms/11-coverage-critic.md). */
export const MAX_REPLAN_ROUNDS = 2;

export const WEIGHTS = {
  affordance: 0.3,
  transition: 0.25,
  state: 0.15,
  class: 0.2,
  assertion: 0.1,
} as const;

export const CLASS_COUNT = 4;
