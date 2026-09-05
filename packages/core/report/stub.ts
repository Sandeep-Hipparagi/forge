import type { Gap } from "../schema/index.js";
import type { ReportInput } from "./score.js";

/**
 * Honest report for the stub (non-live) pipeline — never pretends we visited Checkout.
 * Used when `live: false` so the UI does not fall back to the demo fixture.
 */
export function stubReportInput(
  sessionId: string,
  options: {
    url: string;
    generatedAt: string;
    reportId: string;
    capabilityId: string;
    gapId: string;
  },
): ReportInput {
  let host = options.url;
  try {
    host = new URL(options.url).host;
  } catch {
    /* keep raw */
  }

  const residual: Gap = {
    id: options.gapId,
    class: "MISSING_FLOW",
    title: "Live explore was not enabled",
    why: `This session for ${host} used the stub pipeline. No browser opened, so scenarios are simulated. Re-run with Live explore checked (FORGE_LIVE_SESSIONS=true).`,
    severity: "MAJOR",
    suggestedScenario: "Enable Live explore and start again against the same URL",
    affordanceRefs: [],
  };

  return {
    sessionId,
    reportId: options.reportId,
    generatedAt: options.generatedAt,
    scenariosCovered: [
      {
        scenarioId: "SC-STUB-001",
        capability: host,
        title: "Stub pipeline walkthrough (no live browser)",
        class: "happy",
        priority: "P0",
        status: "passed",
      },
    ],
    outcomes: { passed: 1, failed: 0, healed: 0, flaky: 0, skipped: 0 },
    healerActions: [],
    residualGaps: [residual],
    acceptedRisk: [],
    untestedFlowRisk: [],
    defects: [],
    capabilities: [
      {
        capabilityId: options.capabilityId,
        name: host,
        finalScore: 0.7,
        hasAllFourClasses: false,
        residualGaps: [residual],
        acceptedRisk: [],
      },
    ],
    executedSteps: 4,
    flakySteps: 0,
    emittedStrategies: ["role_name"],
    escalations: 0,
    droppedScenarios: 0,
    acceptedRiskBlockers: 0,
    rolledBackHeals: 0,
  };
}
