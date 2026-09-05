import { describe, expect, it } from "vitest";
import { buildReport, computeRobustnessScore, renderMarkdown } from "./index.js";
import type { ReportInput } from "./score.js";
import type { Gap } from "../schema/index.js";

const gap = (id: string, title: string, severity: Gap["severity"] = "MAJOR"): Gap => ({
  id,
  class: "MISSING_FLOW",
  title,
  why: `why ${title}`,
  severity,
  suggestedScenario: "add one",
  affordanceRefs: [],
});

function sampleInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    sessionId: "ses_00000001",
    reportId: "rpt_00000001",
    generatedAt: "2026-01-01T00:00:00.000Z",
    scenariosCovered: [
      {
        scenarioId: "SC-001",
        capability: "Checkout",
        title: "Happy path checkout",
        class: "happy",
        priority: "P0",
      },
    ],
    outcomes: { passed: 1, failed: 0, healed: 1, flaky: 0, skipped: 0 },
    healerActions: [
      {
        runId: "run_00000001",
        stepId: "s4",
        decision: "HEALED",
        vetoId: null,
        before: "locator('#place-order')",
        after: "getByRole('button', { name: 'Place order' })",
        confidence: 0.891,
        verified: true,
      },
      {
        runId: "run_00000002",
        stepId: "s6",
        decision: "BLOCKED",
        vetoId: "V2",
        before: "getByRole('button', { name: 'Place order' })",
        after: null,
        confidence: 0.71,
        verified: false,
      },
    ],
    residualGaps: [gap("gap_00000001", "coupon flow")],
    acceptedRisk: [gap("gap_00000002", "admin blocker", "BLOCKER")],
    untestedFlowRisk: [
      {
        capabilityId: "cap_00000002",
        name: "Cart",
        why: "Duration budget expired after lap 4",
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
    defects: [],
    capabilities: [
      {
        capabilityId: "cap_00000001",
        name: "Checkout",
        finalScore: 0.84,
        hasAllFourClasses: true,
        residualGaps: [gap("gap_00000001", "coupon flow")],
        acceptedRisk: [],
      },
      {
        capabilityId: "cap_00000002",
        name: "Cart",
        finalScore: null,
        hasAllFourClasses: false,
        residualGaps: [],
        acceptedRisk: [],
      },
    ],
    executedSteps: 138,
    flakySteps: 2,
    emittedStrategies: ["role_name", "role_name", "text"],
    escalations: 2,
    droppedScenarios: 3,
    acceptedRiskBlockers: 1,
    rolledBackHeals: 0,
    ...overrides,
  };
}

describe("buildReport · I-18 five mandated contents", () => {
  it("populates all five brief-mandated fields", () => {
    const report = buildReport(sampleInput());
    expect(report.scenariosCovered.length).toBeGreaterThan(0);
    expect(report.outcomes).toMatchObject({ passed: 1, healed: 1 });
    expect(report.healerActions.length).toBeGreaterThan(0);
    expect(report.coverageGapsRemaining.length).toBeGreaterThan(0);
    expect(report.untestedFlowRisk.length).toBeGreaterThan(0);
  });
});

describe("coverage gaps · residual ≠ accepted risk (14 §2)", () => {
  it("renders residualGaps and acceptedRisk as two sections, never merged", () => {
    const report = buildReport(sampleInput());
    expect(report.residualGaps).toHaveLength(1);
    expect(report.acceptedRisk).toHaveLength(1);
    expect(report.residualGaps[0]!.title).toBe("coupon flow");
    expect(report.acceptedRisk[0]!.title).toBe("admin blocker");

    const md = renderMarkdown(report);
    expect(md).toContain("## 4a. Residual coverage gaps");
    expect(md).toContain("## 4b. Accepted risk");
    expect(md).toContain("coupon flow");
    expect(md).toContain("admin blocker");
    // Both section headings present — not a single merged list.
    const idxResidual = md.indexOf("## 4a. Residual coverage gaps");
    const idxAccepted = md.indexOf("## 4b. Accepted risk");
    expect(idxResidual).toBeGreaterThan(-1);
    expect(idxAccepted).toBeGreaterThan(idxResidual);
  });
});

describe("RobustnessScore · I-19 recomputes from stored rows", () => {
  it("matches the worked example shape from 14 §3.3", () => {
    const input = sampleInput({
      capabilities: [
        {
          capabilityId: "cap_1",
          name: "Checkout",
          finalScore: 0.84,
          hasAllFourClasses: true,
          residualGaps: [],
          acceptedRisk: [],
        },
        {
          capabilityId: "cap_2",
          name: "Sign-in",
          finalScore: 0.79,
          hasAllFourClasses: true,
          residualGaps: [],
          acceptedRisk: [],
        },
        {
          capabilityId: "cap_3",
          name: "Account",
          finalScore: 0.72,
          hasAllFourClasses: false,
          residualGaps: [],
          acceptedRisk: [],
        },
        {
          capabilityId: "cap_4",
          name: "Admin",
          finalScore: 0.65,
          hasAllFourClasses: false,
          residualGaps: [],
          acceptedRisk: [],
        },
        {
          capabilityId: "cap_5",
          name: "Cart",
          finalScore: null,
          hasAllFourClasses: false,
          residualGaps: [],
          acceptedRisk: [],
        },
        {
          capabilityId: "cap_6",
          name: "Browse",
          finalScore: null,
          hasAllFourClasses: false,
          residualGaps: [],
          acceptedRisk: [],
        },
      ],
      executedSteps: 138,
      flakySteps: 2,
      emittedStrategies: Array(38).fill("role_name") as ReportInput["emittedStrategies"],
      // mean trust 0.884 approximated: mix to land near example
      escalations: 2,
      droppedScenarios: 3,
      acceptedRiskBlockers: 1,
      rolledBackHeals: 0,
    });
    // Override resilience with mixed strategies approximating 0.884 mean trust
    const mixed: ReportInput["emittedStrategies"] = [
      ...Array(30).fill("role_name"),
      ...Array(5).fill("text"),
      ...Array(3).fill("css"),
    ] as ReportInput["emittedStrategies"];
    input.emittedStrategies = mixed;

    const score = computeRobustnessScore(input);
    // Coverage: 30 * (0.84+0.79+0.72+0.65+0+0)/6 = 15
    expect(score.components.coverage).toBe(15);
    // Depth: 20 * 2/6 ≈ 6.67
    expect(score.components.depth).toBeCloseTo(6.67, 1);
    // Determinism: 15 * (1 - 2/138) ≈ 14.78
    expect(score.components.determinism).toBeCloseTo(14.78, 1);
    // Integrity: 20 - 4 - 3 - 2 - 0 = 11
    expect(score.components.integrity).toBe(11);
    expect(score.current).toBeGreaterThanOrEqual(55);
    expect(score.current).toBeLessThanOrEqual(70);

    // I-19: recompute exactly
    const again = computeRobustnessScore(input);
    expect(again).toEqual(score);
  });

  it("hoursSaved is null below the sprint floor", () => {
    const report = buildReport(sampleInput());
    expect(report.hoursSaved).toBeNull();
  });
});

describe("renderMarkdown · five mandated sections", () => {
  it("prints all five brief sections", () => {
    const md = renderMarkdown(buildReport(sampleInput()));
    expect(md).toContain("## 1. Test scenarios covered");
    expect(md).toContain("## 2. Pass/fail outcomes");
    expect(md).toContain("## 3. Self-healing actions taken");
    expect(md).toContain("## 4a. Residual coverage gaps");
    expect(md).toContain("## 4b. Accepted risk");
    expect(md).toContain("## 5. Untested flow risk");
    expect(md).toContain("## Robustness Score");
  });
});
