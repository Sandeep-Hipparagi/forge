import type { TestPlan, Scenario, Capability } from "@forge/core";

function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+-.!]/g, "\\$&").replace(/\|/g, "\\|");
}

function formatStep(step: Scenario["steps"][0]): string {
  const affordance = step.affordanceRef ? `\`${step.affordanceRef}\`` : "—";
  return `| ${step.order} | ${step.kind} | ${escapeMd(step.targetIntent)} | \`${step.stateId}\` | ${affordance} |`;
}

export function renderPlan(plan: TestPlan, capability: Capability): string {
  const lines: string[] = [];

  lines.push(`# ${capability.name} — Test Plan (round ${plan.round})`);
  lines.push("");
  lines.push(`**Capability.** ${capability.description}`);
  lines.push(
    `**Risk.** ${capability.risk.score.toFixed(3)} — money ${capability.risk.factors.moneyOrPii.toFixed(2)} · mutation ${capability.risk.factors.dataMutation.toFixed(2)} · auth ${capability.risk.factors.authProximity.toFixed(2)} · centrality ${capability.risk.factors.graphCentrality.toFixed(2)} · density ${capability.risk.factors.affordanceDensity.toFixed(2)}`,
  );
  lines.push(`**Entry state.** \`${capability.entryStateId}\``);
  lines.push(`**Exit conditions.** ${capability.exitConditions.join(" · ")}`);
  lines.push("");

  const sortedScenarios = [...plan.scenarios].sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.id.localeCompare(b.id);
  });

  for (const scenario of sortedScenarios) {
    lines.push(
      `## ${scenario.id} · ${escapeMd(scenario.title)} — \`${scenario.class}\` · **${scenario.priority}**`,
    );
    lines.push(`> ${scenario.priorityReason}`);
    lines.push("");

    if (scenario.preconditions.length > 0) {
      lines.push("**Preconditions**");
      for (const pc of scenario.preconditions) {
        lines.push(`- ${escapeMd(pc)}`);
      }
      lines.push("");
    }

    lines.push("**Steps**");
    lines.push("| # | Action | Intent | State | Affordance |");
    lines.push("|---|---|---|---|---|");
    for (const step of scenario.steps.sort((a, b) => a.order - b.order)) {
      lines.push(formatStep(step));
    }
    lines.push("");

    lines.push(`**Expected outcome.** ${escapeMd(scenario.expectedOutcome)}`);
    lines.push("");

    if (scenario.plannedNotGenerated) {
      lines.push(
        `> ⚠️ **Planned but not generated:** ${scenario.notGeneratedReason}`,
      );
      lines.push("");
    }
  }

  return lines.join("\n") + "\n";
}
