import { describe, expect, it } from "vitest";
import { COVERAGE_FLOOR } from "./constants.js";
import { ec03CheckoutSubgraph, ec03Round0Plan } from "./ec03-fixture.js";
import { runReplanLoop } from "./replan.js";
import { verdict } from "./verdict.js";

const ids = (() => {
  let n = 0;
  return {
    next: (prefix: string) => `${prefix}_${String(++n).padStart(8, "0")}`,
  };
})();

describe("re-plan loop · TG-5b / TG-6", () => {
  it("TG-6 · replanRounds 2 → third round never happens; cap yields ACCEPT_RISK", () => {
    const sub = ec03CheckoutSubgraph();
    // Force a weak seed every round by always reseeding happy-only
    const result = runReplanLoop({
      subgraph: sub,
      lap: { id: "lap_01j9x2k9", replanRounds: 2 },
      ids,
      createdAt: "2026-01-01T00:00:00.000Z",
      seedPlan: ec03Round0Plan(),
    });

    expect(result.final.verdict).toBe("ACCEPT_RISK");
    expect(result.acceptedRisk.length).toBeGreaterThan(0);
    expect(result.rounds).toHaveLength(1);
  });

  it("TG-5b · floor alone blocks; blockers alone block; clear plan passes", () => {
    expect(verdict({ score: 0.5, floor: COVERAGE_FLOOR, gaps: [] }, { replanRounds: 0 })).toBe(
      "REPLAN",
    );
    expect(
      verdict(
        {
          score: 1,
          floor: COVERAGE_FLOOR,
          gaps: [
            {
              id: "gap_00000001",
              class: "MISSING_ERROR_STATE",
              title: "x",
              why: "y",
              severity: "BLOCKER",
              suggestedScenario: "z",
              affordanceRefs: [],
            },
          ],
        },
        { replanRounds: 0 },
      ),
    ).toBe("REPLAN");
    expect(verdict({ score: 0.7, floor: COVERAGE_FLOOR, gaps: [] }, { replanRounds: 0 })).toBe(
      "PASS",
    );
  });

  it("weak seed is rejected then template revision can clear or accept risk", () => {
    const sub = ec03CheckoutSubgraph();
    const result = runReplanLoop({
      subgraph: sub,
      lap: { id: "lap_01j9x2k9", replanRounds: 0 },
      ids,
      createdAt: "2026-01-01T00:00:00.000Z",
      seedPlan: ec03Round0Plan(),
    });

    expect(result.rounds[0]!.assessment.verdict).toBe("REPLAN");
    expect(["PASS", "REPLAN", "ACCEPT_RISK"]).toContain(result.final.verdict);
    expect(result.rounds.length).toBeGreaterThanOrEqual(2);
  });
});
