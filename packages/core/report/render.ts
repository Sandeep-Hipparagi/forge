import type { Gap, QualityReport } from "../schema/index.js";

export type RenderableReport = QualityReport & {
  residualGaps?: Gap[];
  acceptedRisk?: Gap[];
};

/**
 * Markdown rendering of a QualityReport ([14 §8](docs/03-algorithms/14-quality-report-and-score.md)).
 * Five brief-mandated sections plus score. Residual gaps and accepted risk are **two** sections.
 */
export function renderMarkdown(report: RenderableReport): string {
  const residual = report.residualGaps ?? [];
  const accepted = report.acceptedRisk ?? [];
  const lines: string[] = [
    `# FORGE Quality Report`,
    ``,
    `Session: \`${report.sessionId}\` · Generated: ${report.generatedAt}`,
    ``,
    `## Robustness Score`,
    ``,
    `**${report.score.current}** / 100 (projected **${report.score.projected}**)`,
    ``,
    `| Component | Points |`,
    `| --- | ---: |`,
    ...Object.entries(report.score.components).map(
      ([name, pts]) => `| ${name} | ${pts.toFixed(2)} |`,
    ),
    ``,
    `## 1. Test scenarios covered`,
    ``,
  ];

  if (report.scenariosCovered.length === 0) {
    lines.push(`_None._`, ``);
  } else {
    lines.push(`| ID | Capability | Title | Class | Priority |`, `| --- | --- | --- | --- | --- |`);
    for (const s of report.scenariosCovered) {
      lines.push(`| ${s.scenarioId} | ${s.capability} | ${s.title} | ${s.class} | ${s.priority} |`);
    }
    lines.push(``);
  }

  lines.push(
    `## 2. Pass/fail outcomes`,
    ``,
    `| Outcome | Count |`,
    `| --- | ---: |`,
    `| passed | ${report.outcomes.passed} |`,
    `| failed | ${report.outcomes.failed} |`,
    `| healed | ${report.outcomes.healed} |`,
    `| flaky | ${report.outcomes.flaky} |`,
    `| skipped | ${report.outcomes.skipped} |`,
    ``,
    `## 3. Self-healing actions taken`,
    ``,
  );

  if (report.healerActions.length === 0) {
    lines.push(`_None._`, ``);
  } else {
    lines.push(
      `| Step | Decision | Veto | Before → After | Conf. | Verified |`,
      `| --- | --- | --- | --- | ---: | --- |`,
    );
    for (const a of report.healerActions) {
      lines.push(
        `| ${a.stepId} | ${a.decision} | ${a.vetoId ?? "—"} | \`${a.before}\` → \`${a.after ?? "—"}\` | ${a.confidence.toFixed(3)} | ${a.verified ? "✅" : "—"} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## 4a. Residual coverage gaps`, ``);
  appendGaps(lines, residual);

  lines.push(`## 4b. Accepted risk`, ``);
  appendGaps(lines, accepted);

  lines.push(`## 5. Untested flow risk`, ``);
  if (report.untestedFlowRisk.length === 0) {
    lines.push(`_None._`, ``);
  } else {
    lines.push(`| Capability | Risk | Why |`, `| --- | ---: | --- |`);
    for (const u of report.untestedFlowRisk) {
      lines.push(`| ${u.name} | ${u.riskScore.toFixed(3)} | ${u.why} |`);
    }
    lines.push(``);
  }

  if (report.defects.length > 0) {
    lines.push(`## Defects`, ``);
    for (const d of report.defects) {
      lines.push(
        `- **${d.capability}** (${d.severity}): expected \`${d.expected}\` · actual \`${d.actual}\``,
      );
    }
    lines.push(``);
  }

  return lines.join("\n");
}

function appendGaps(lines: string[], gaps: Gap[]): void {
  if (gaps.length === 0) {
    lines.push(`_None._`, ``);
    return;
  }
  for (const g of gaps) {
    lines.push(`- **[${g.severity}]** ${g.title} — ${g.why}`);
  }
  lines.push(``);
}
