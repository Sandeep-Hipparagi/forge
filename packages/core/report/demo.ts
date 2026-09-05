import type { Gap } from "../schema/index.js";
import type { ReportInput } from "./score.js";

/**
 * Demo session used by `forge report` and `GET /api/sessions/:id/report`
 * when no stored report-input exists — enough to exercise the five mandated sections.
 */
export function demoReportInput(sessionId: string): ReportInput {
  const residual: Gap = {
    id: "gap_00000001",
    class: "MISSING_FLOW",
    title: "coupon redemption",
    why: "No scenario exercises the coupon field",
    severity: "MAJOR",
    suggestedScenario: "Apply a valid coupon at checkout",
    affordanceRefs: [],
  };
  const accepted: Gap = {
    id: "gap_00000002",
    class: "MISSING_ERROR_STATE",
    title: "payment gateway timeout",
    why: "Re-plan cap spent; shipped with accepted risk",
    severity: "BLOCKER",
    suggestedScenario: "Simulate payment timeout",
    affordanceRefs: [],
  };
  return {
    sessionId,
    reportId: "rpt_demo0001",
    generatedAt: "2026-01-01T00:00:00.000Z",
    scenariosCovered: [
      {
        scenarioId: "SC-001",
        capability: "Checkout",
        title: "Happy path place order",
        class: "happy",
        priority: "P0",
        status: "passed",
      },
      {
        scenarioId: "SC-002",
        capability: "Checkout",
        title: "Reject expired card",
        class: "negative",
        priority: "P1",
        status: "failed",
        failureReason: 'assertText failed: expected to contain "Card declined"',
      },
    ],
    outcomes: { passed: 1, failed: 1, healed: 1, flaky: 0, skipped: 0 },
    healerActions: [
      {
        runId: "run_demo0001",
        stepId: "s4",
        decision: "HEALED",
        vetoId: null,
        before: "locator('#submit-action')",
        after: "getByRole('button', { name: 'Submit' })",
        confidence: 0.891,
        verified: true,
      },
      {
        runId: "run_demo0002",
        stepId: "s6",
        decision: "BLOCKED",
        vetoId: "V2",
        before: "getByRole('button', { name: 'Submit' })",
        after: null,
        confidence: 0.71,
        verified: false,
      },
    ],
    residualGaps: [residual],
    acceptedRisk: [accepted],
    untestedFlowRisk: [
      {
        capabilityId: "cap_demo0002",
        name: "Cart",
        why: "Duration budget expired",
        riskScore: 0.446,
        factors: {
          authProximity: 0.2,
          dataMutation: 0.5,
          moneyOrPii: 0.4,
          graphCentrality: 0.3,
          affordanceDensity: 0.4,
          statedIntent: 0.5,
        },
      },
    ],
    defects: [
      {
        diagnosisId: "diag_demo0001",
        capability: "Checkout",
        expected: "Reject expired card (SC-002)",
        actual: 'assertText failed: expected to contain "Card declined"',
        severity: "MAJOR",
      },
    ],
    capabilities: [
      {
        capabilityId: "cap_demo0001",
        name: "Checkout",
        finalScore: 0.84,
        hasAllFourClasses: true,
        residualGaps: [residual],
        acceptedRisk: [],
      },
      {
        capabilityId: "cap_demo0002",
        name: "Cart",
        finalScore: null,
        hasAllFourClasses: false,
        residualGaps: [],
        acceptedRisk: [],
      },
    ],
    executedSteps: 40,
    flakySteps: 0,
    emittedStrategies: ["role_name", "role_name", "text"],
    escalations: 0,
    droppedScenarios: 0,
    acceptedRiskBlockers: 1,
    rolledBackHeals: 0,
  };
}
