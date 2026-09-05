import { describe, expect, it } from "vitest";
import { classGaps } from "./class-gaps.js";
import { COVERAGE_FLOOR } from "./constants.js";
import { ec03CheckoutSubgraph, ec03Round0Plan } from "./ec03-fixture.js";
import { structuralScore } from "./structural.js";
import { verdict } from "./verdict.js";

describe("structuralScore · EC-03 round 0", () => {
  it("matches the term breakdown A 9/21 · T 5/12 · S 3/4 · C 1/4 · D 4/6", () => {
    const sub = ec03CheckoutSubgraph();
    const plan = ec03Round0Plan();
    const coverage = structuralScore(plan, sub);

    expect(sub.affordances.filter((a) => a.enabled && !a.destructive)).toHaveLength(21);
    expect(sub.affordances.filter((a) => a.destructive)).toHaveLength(2);
    expect(sub.transitions).toHaveLength(12);
    expect(sub.states).toHaveLength(4);

    expect(coverage.affordances).toMatchObject({ numerator: 9, denominator: 21 });
    expect(coverage.transitions).toMatchObject({ numerator: 5, denominator: 12 });
    expect(coverage.states).toMatchObject({ numerator: 3, denominator: 4 });
    expect(coverage.classes).toMatchObject({ numerator: 1, denominator: 4 });
    expect(coverage.assertions).toMatchObject({ assertionSteps: 4, scenarios: 3 });
    expect(coverage.assertions.density).toBeCloseTo(4 / 6, 4);

    // Formula on those terms rounds to 0.4619. Doc 11 §3.4 prints 0.4519 (off by 0.01);
    // the ratios above are the acceptance criterion owned by that section.
    expect(coverage.score).toBe(0.4619);
  });
});

describe("coverage floor · both sides", () => {
  it("0.6999 → REPLAN and 0.70 → PASS when there are no blockers", () => {
    expect(verdict({ score: 0.6999, floor: COVERAGE_FLOOR, gaps: [] }, { replanRounds: 0 })).toBe(
      "REPLAN",
    );
    expect(verdict({ score: 0.7, floor: COVERAGE_FLOOR, gaps: [] }, { replanRounds: 0 })).toBe(
      "PASS",
    );
  });

  it("TG-5b · a BLOCKER blocks even at score 1.0", () => {
    expect(
      verdict(
        {
          score: 1,
          floor: COVERAGE_FLOOR,
          gaps: [
            {
              id: "gap_00000001",
              class: "MISSING_ERROR_STATE",
              title: "blocker",
              why: "missing",
              severity: "BLOCKER",
              suggestedScenario: "add one",
              affordanceRefs: [],
            },
          ],
        },
        { replanRounds: 0 },
      ),
    ).toBe("REPLAN");
  });
});

describe("classGaps · EC-03 round 0", () => {
  it("mints blockers for missing negative and error_state; verdict is REPLAN", () => {
    const sub = ec03CheckoutSubgraph();
    const plan = ec03Round0Plan();
    const gaps = classGaps(plan, sub);
    const blockers = gaps.filter((g) => g.severity === "BLOCKER");
    expect(blockers.some((g) => g.class === "MISSING_EDGE_CASE")).toBe(true);
    expect(blockers.some((g) => g.class === "MISSING_ERROR_STATE")).toBe(true);

    const score = structuralScore(plan, sub).score;
    expect(verdict({ score, floor: COVERAGE_FLOOR, gaps }, { replanRounds: 0 })).toBe("REPLAN");
  });
});
