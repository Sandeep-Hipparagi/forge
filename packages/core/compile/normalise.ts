import type { Scenario, TestPlan, TestStep } from "../schema/index.js";

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Pass 1 — order scenarios by (priority, id); steps by `order`. */
export function normalise(plan: TestPlan): TestPlan {
  const scenarios = [...plan.scenarios]
    .map((scenario) => ({
      ...scenario,
      steps: [...scenario.steps].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      return pr !== 0 ? pr : a.id.localeCompare(b.id);
    });

  return { ...plan, scenarios };
}

export function orderedSteps(scenario: Scenario): TestStep[] {
  return [...scenario.steps].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
