import { describe, expect, it } from "vitest";
import { verdict, mergeGaps } from "../src/verdict.js";
import type { CoverageAssessment, Gap } from "../src/types.js";

const emptyStructural: CoverageAssessment["structural"] = {
  affordances: { cited: 0, eligible: 0, ratio: 0 },
  transitions: { cited: 0, total: 0, ratio: 0 },
  states: { cited: 0, total: 0, ratio: 0 },
  classes: { present: 0, total: 0, ratio: 0 },
  assertions: { count: 0, max: 0, ratio: 0 },
};

describe("verdict", () => {
  it("returns PASS when no blockers and score >= floor", () => {
    const assessment: CoverageAssessment = {
      id: "cva_1",
      lapId: "lap_1",
      planId: "pln_1",
      round: 0,
      score: 0.85,
      floor: 0.7,
      structural: emptyStructural,
      gaps: [
        {
          id: "gap_1",
          class: "MISSING_FLOW",
          title: "Minor gap",
          why: "test",
          severity: "MINOR",
          suggestedScenario: "test",
          affordanceRefs: [],
        },
      ],
      residualGaps: [],
      prdGaps: [],
      verdict: "PASS",
      source: "deterministic",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const lap = { id: "lap_1", replanRounds: 0, maxReplanRounds: 2 };
    expect(verdict(assessment, lap)).toBe("PASS");
  });

  it("returns REPLAN when score < floor and rounds remaining", () => {
    const assessment: CoverageAssessment = {
      id: "cva_1",
      lapId: "lap_1",
      planId: "pln_1",
      round: 0,
      score: 0.5,
      floor: 0.7,
      structural: emptyStructural,
      gaps: [],
      residualGaps: [],
      prdGaps: [],
      verdict: "REPLAN",
      source: "deterministic",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const lap = { id: "lap_1", replanRounds: 0, maxReplanRounds: 2 };
    expect(verdict(assessment, lap)).toBe("REPLAN");
  });

  it("returns REPLAN when blocker present and rounds remaining", () => {
    const assessment: CoverageAssessment = {
      id: "cva_1",
      lapId: "lap_1",
      planId: "pln_1",
      round: 0,
      score: 0.9,
      floor: 0.7,
      structural: emptyStructural,
      gaps: [
        {
          id: "gap_1",
          class: "MISSING_EDGE_CASE",
          title: "No negative",
          why: "test",
          severity: "BLOCKER",
          suggestedScenario: "test",
          affordanceRefs: [],
        },
      ],
      residualGaps: [],
      prdGaps: [],
      verdict: "REPLAN",
      source: "deterministic",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const lap = { id: "lap_1", replanRounds: 0, maxReplanRounds: 2 };
    expect(verdict(assessment, lap)).toBe("REPLAN");
  });

  it("returns ACCEPT_RISK when no rounds remaining and score < floor", () => {
    const assessment: CoverageAssessment = {
      id: "cva_1",
      lapId: "lap_1",
      planId: "pln_1",
      round: 2,
      score: 0.5,
      floor: 0.7,
      structural: emptyStructural,
      gaps: [],
      residualGaps: [],
      prdGaps: [],
      verdict: "ACCEPT_RISK",
      source: "deterministic",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const lap = { id: "lap_1", replanRounds: 2, maxReplanRounds: 2 };
    expect(verdict(assessment, lap)).toBe("ACCEPT_RISK");
  });

  it("returns ACCEPT_RISK when no rounds remaining and blocker present", () => {
    const assessment: CoverageAssessment = {
      id: "cva_1",
      lapId: "lap_1",
      planId: "pln_1",
      round: 2,
      score: 0.9,
      floor: 0.7,
      structural: emptyStructural,
      gaps: [
        {
          id: "gap_1",
          class: "MISSING_EDGE_CASE",
          title: "No negative",
          why: "test",
          severity: "BLOCKER",
          suggestedScenario: "test",
          affordanceRefs: [],
        },
      ],
      residualGaps: [],
      prdGaps: [],
      verdict: "ACCEPT_RISK",
      source: "deterministic",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const lap = { id: "lap_1", replanRounds: 2, maxReplanRounds: 2 };
    expect(verdict(assessment, lap)).toBe("ACCEPT_RISK");
  });
});

describe("mergeGaps", () => {
  it("clamps semantic BLOCKER to MAJOR", () => {
    const structural: Gap[] = [
      {
        id: "gap_1",
        class: "MISSING_FLOW",
        title: "Structural",
        why: "test",
        severity: "MINOR",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
    ];
    const semantic: Gap[] = [
      {
        id: "gap_2",
        class: "MISSING_ERROR_STATE",
        title: "Semantic blocker",
        why: "test",
        severity: "BLOCKER",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
    ];
    const merged = mergeGaps(structural, semantic, 12);
    const blocker = merged.find((g) => g.title === "Semantic blocker");
    expect(blocker?.severity).toBe("MAJOR");
  });

  it("deduplicates gaps with similar titles", () => {
    const structural: Gap[] = [
      {
        id: "gap_1",
        class: "MISSING_FLOW",
        title: "Cancel order not tested",
        why: "test",
        severity: "MINOR",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
    ];
    const semantic: Gap[] = [
      {
        id: "gap_2",
        class: "MISSING_FLOW",
        title: "Cancel order not tested",
        why: "test",
        severity: "MAJOR",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
    ];
    const merged = mergeGaps(structural, semantic, 12);
    const cancelGaps = merged.filter((g) =>
      g.title.toLowerCase().includes("cancel"),
    );
    expect(cancelGaps.length).toBe(1);
    expect(cancelGaps[0]!.severity).toBe("MAJOR"); // higher severity wins
  });

  it("sorts by severity desc, then class, then title", () => {
    const structural: Gap[] = [
      {
        id: "gap_1",
        class: "MISSING_FLOW",
        title: "A gap",
        why: "test",
        severity: "MINOR",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
      {
        id: "gap_2",
        class: "MISSING_EDGE_CASE",
        title: "B gap",
        why: "test",
        severity: "MAJOR",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
      {
        id: "gap_3",
        class: "MISSING_ERROR_STATE",
        title: "C gap",
        why: "test",
        severity: "BLOCKER",
        suggestedScenario: "test",
        affordanceRefs: [],
      },
    ];
    const merged = mergeGaps(structural, [], 12);
    expect(merged[0]!.title).toBe("C gap"); // BLOCKER first
    expect(merged[1]!.title).toBe("B gap"); // MAJOR second
    expect(merged[2]!.title).toBe("A gap"); // MINOR third
  });

  it("caps at GAP_CAP", () => {
    const structural: Gap[] = Array.from({ length: 20 }, (_, i) => ({
      id: `gap_${i}`,
      class: "MISSING_FLOW",
      title: `Gap ${i}`,
      why: "test",
      severity: "MINOR",
      suggestedScenario: "test",
      affordanceRefs: [],
    }));
    const merged = mergeGaps(structural, [], 12);
    expect(merged.length).toBe(12);
  });
});
