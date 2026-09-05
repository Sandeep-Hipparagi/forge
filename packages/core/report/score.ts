import type { Gap, QualityReport, RobustnessScore, ScenarioClass } from "../schema/index.js";
import { BASE_TRUST } from "../healing/constants.js";

export type ReportScenario = {
  scenarioId: string;
  capability: string;
  title: string;
  class: ScenarioClass;
  priority: "P0" | "P1" | "P2" | "P3";
};

export type ReportHealerAction = QualityReport["healerActions"][number];

export type ReportDefect = QualityReport["defects"][number];

export type ReportUntested = QualityReport["untestedFlowRisk"][number];

export type CapabilityScoreInput = {
  capabilityId: string;
  name: string;
  /** Final assessment score; null/undefined if never banked → counts as 0. */
  finalScore: number | null;
  /** True when the final plan carries all four scenario classes. */
  hasAllFourClasses: boolean;
  residualGaps: Gap[];
  acceptedRisk: Gap[];
};

export type ReportInput = {
  sessionId: string;
  reportId: string;
  generatedAt: string;
  scenariosCovered: ReportScenario[];
  outcomes: QualityReport["outcomes"];
  healerActions: ReportHealerAction[];
  /** Residual gaps from passing assessments — rendered separately from accepted risk. */
  residualGaps: Gap[];
  /** Accepted risk from re-plan cap — never merged with residualGaps. */
  acceptedRisk: Gap[];
  untestedFlowRisk: ReportUntested[];
  defects: ReportDefect[];
  capabilities: CapabilityScoreInput[];
  executedSteps: number;
  flakySteps: number;
  /** Emitted locator strategies for resilience term. */
  emittedStrategies: readonly (keyof typeof BASE_TRUST)[];
  escalations: number;
  droppedScenarios: number;
  acceptedRiskBlockers: number;
  rolledBackHeals: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Robustness Score arithmetic ([14 §3](docs/03-algorithms/14-quality-report-and-score.md)).
 * Pure function of stored rows (`I-19`).
 */
export function computeRobustnessScore(input: ReportInput): RobustnessScore {
  const n = input.capabilities.length;
  const coverageMean =
    n === 0 ? 0 : input.capabilities.reduce((sum, c) => sum + (c.finalScore ?? 0), 0) / n;
  const coverage = 30 * coverageMean;

  const depthCount = input.capabilities.filter((c) => c.hasAllFourClasses).length;
  const depth = n === 0 ? 0 : 20 * (depthCount / n);

  const determinism =
    input.executedSteps === 0 ? 15 : 15 * (1 - input.flakySteps / input.executedSteps);

  const meanTrust =
    input.emittedStrategies.length === 0
      ? 0
      : input.emittedStrategies.reduce((sum, s) => sum + BASE_TRUST[s], 0) /
        input.emittedStrategies.length;
  const resilience = 15 * meanTrust;

  const esc = Math.min(2 * input.escalations, 8);
  const drop = Math.min(1 * input.droppedScenarios, 6);
  const risk = Math.min(2 * input.acceptedRiskBlockers, 4);
  const roll = Math.min(3 * input.rolledBackHeals, 6);
  const integrity = Math.max(0, 20 - esc - drop - risk - roll);

  const currentRaw = coverage + depth + determinism + resilience + integrity;
  const current = Math.min(100, Math.max(0, Math.round(currentRaw)));

  const perCapShare = n === 0 ? 0 : 50 / n;
  const perCapability = input.capabilities.map((c) => {
    const covPts = (c.finalScore ?? 0) * (30 / (n || 1));
    const depthPts = c.hasAllFourClasses ? 20 / (n || 1) : 0;
    const points = round2(covPts + depthPts);
    const lostBecause: string[] = [];
    if (c.finalScore === null) lostBecause.push("never tested");
    if (!c.hasAllFourClasses && c.finalScore !== null) {
      lostBecause.push("missing scenario class(es)");
    }
    for (const gap of c.residualGaps) lostBecause.push(`residual: ${gap.title}`);
    for (const gap of c.acceptedRisk) lostBecause.push(`accepted risk: ${gap.title}`);
    return {
      capabilityId: c.capabilityId,
      name: c.name,
      points,
      lostBecause,
    };
  });

  // Projected: resolve open findings jointly (simplified sprint estimate).
  const projectedRaw = Math.min(
    100,
    currentRaw +
      input.capabilities.filter((c) => c.finalScore === null).length * (perCapShare || 0) +
      2 * input.escalations +
      input.droppedScenarios +
      2 * input.acceptedRiskBlockers,
  );

  return {
    current,
    projected: Math.min(100, Math.round(projectedRaw)),
    components: {
      coverage: round2(coverage),
      depth: round2(depth),
      determinism: round2(determinism),
      resilience: round2(resilience),
      integrity: round2(integrity),
    },
    perCapability,
    findings: [
      ...(input.capabilities.some((c) => c.finalScore === null)
        ? [
            {
              findingId: "find_untested",
              title: "Untested capabilities in the backlog",
              pointsIfFixed: round2(
                input.capabilities.filter((c) => c.finalScore === null).length * (perCapShare || 0),
              ),
            },
          ]
        : []),
      ...(input.escalations > 0
        ? [
            {
              findingId: "find_escalations",
              title: "Resolve open escalations",
              pointsIfFixed: round2(Math.min(2 * input.escalations, 8)),
            },
          ]
        : []),
    ],
  };
}

/**
 * Assemble a QualityReport from stored rows. Pure — no model, no I/O.
 * Coverage gaps remaining lists residualGaps and acceptedRisk **separately**
 * in the rendered report; the schema field concatenates with a marker via
 * `buildReport` consumers reading both input arrays ([14 §2](docs/03-algorithms/14-quality-report-and-score.md)).
 */
export function buildReport(input: ReportInput): QualityReport & {
  residualGaps: Gap[];
  acceptedRisk: Gap[];
} {
  const score = computeRobustnessScore(input);
  return {
    id: input.reportId,
    sessionId: input.sessionId,
    scenariosCovered: input.scenariosCovered,
    outcomes: input.outcomes,
    healerActions: input.healerActions,
    coverageGapsRemaining: [...input.residualGaps, ...input.acceptedRisk],
    residualGaps: input.residualGaps,
    acceptedRisk: input.acceptedRisk,
    untestedFlowRisk: input.untestedFlowRisk,
    defects: input.defects,
    score,
    hoursSaved: null,
    generatedAt: input.generatedAt,
  };
}
