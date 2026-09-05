import { describe, expect, it } from "vitest";
import {
  canStartSession,
  canStartLap,
  planIsGrounded,
  afterCritique,
  canHeal,
  exitCodeFor,
} from "../src/index.js";
import type {
  Capability,
  TestPlan,
  CoverageAssessment,
  Lap,
} from "@forge/core";

describe("session guards", () => {
  it("accepts only allowed http targets", () => {
    expect(canStartSession("https://example.test", ["example.test"])).toBe(
      true,
    );
    expect(canStartSession("file:///tmp/test", ["example.test"])).toBe(false);
  });
  it("keeps product findings distinct from harness failures", () => {
    expect(exitCodeFor("COMPLETED", 1)).toBe(1);
    expect(exitCodeFor("ERROR", 1)).toBe(3);
  });
});

describe("lap guards (TG-2)", () => {
  it("allows lap when all dependencies are banked", () => {
    const capability = {
      id: "cap_00000001",
      dependsOn: ["cap_00000000"],
    } as unknown as Capability;
    const banked = new Set(["cap_00000000"]);
    expect(canStartLap(capability, banked)).toBe(true);
  });
  it("blocks lap when dependencies are missing", () => {
    const capability = {
      id: "cap_00000001",
      dependsOn: ["cap_00000000", "cap_00000002"],
    } as unknown as Capability;
    const banked = new Set(["cap_00000000"]);
    expect(canStartLap(capability, banked)).toBe(false);
  });
  it("allows lap with no dependencies", () => {
    const capability = {
      id: "cap_00000000",
      dependsOn: [],
    } as unknown as Capability;
    const banked = new Set<string>();
    expect(canStartLap(capability, banked)).toBe(true);
  });
});

describe("plan grounding (TG-3)", () => {
  const stateIds = new Set(["st_00000000", "st_00000001"]);
  const affordanceRefs = new Set(["aff_00000000", "aff_00000001"]);

  it("accepts grounded plan", () => {
    const plan = {
      scenarios: [
        {
          steps: [
            {
              id: "s0",
              kind: "navigate",
              stateId: "st_00000000",
              affordanceRef: null,
            },
            {
              id: "s1",
              kind: "click",
              stateId: "st_00000001",
              affordanceRef: "aff_00000000",
            },
          ],
        },
      ],
    } as TestPlan;
    expect(planIsGrounded(plan, stateIds, affordanceRefs)).toBe(true);
  });
  it("rejects plan with unknown state", () => {
    const plan = {
      scenarios: [
        {
          steps: [
            {
              id: "s0",
              kind: "navigate",
              stateId: "st_99999999",
              affordanceRef: null,
            },
          ],
        },
      ],
    } as TestPlan;
    expect(planIsGrounded(plan, stateIds, affordanceRefs)).toBe(false);
  });
  it("rejects plan with unknown affordance", () => {
    const plan = {
      scenarios: [
        {
          steps: [
            {
              id: "s0",
              kind: "click",
              stateId: "st_00000000",
              affordanceRef: "aff_99999999",
            },
          ],
        },
      ],
    } as TestPlan;
    expect(planIsGrounded(plan, stateIds, affordanceRefs)).toBe(false);
  });
  it("rejects navigate with non-null affordanceRef", () => {
    const plan = {
      scenarios: [
        {
          steps: [
            {
              id: "s0",
              kind: "navigate",
              stateId: "st_00000000",
              affordanceRef: "aff_00000000",
            },
          ],
        },
      ],
    } as TestPlan;
    expect(planIsGrounded(plan, stateIds, affordanceRefs)).toBe(false);
  });
  it("rejects non-navigate with null affordanceRef", () => {
    const plan = {
      scenarios: [
        {
          steps: [
            {
              id: "s0",
              kind: "click",
              stateId: "st_00000000",
              affordanceRef: null,
            },
          ],
        },
      ],
    } as TestPlan;
    expect(planIsGrounded(plan, stateIds, affordanceRefs)).toBe(false);
  });
});

describe("critique transitions (TG-4, TG-5)", () => {
  const baseLap = {
    id: "lap_00000000",
    replanRounds: 0,
  } as Lap;

  it("advances to GENERATING when score meets floor and no blockers (TG-4)", () => {
    const assessment = {
      score: 0.8,
      floor: 0.7,
      gaps: [{ severity: "MINOR" as const }],
    } as CoverageAssessment;
    expect(afterCritique(baseLap, assessment)).toEqual({
      next: "GENERATING",
      acceptedRisk: false,
    });
  });

  it("replans when score below floor and rounds remaining (TG-5)", () => {
    const assessment = {
      score: 0.5,
      floor: 0.7,
      gaps: [{ severity: "MINOR" as const }],
    } as CoverageAssessment;
    expect(afterCritique(baseLap, assessment)).toEqual({
      next: "PLANNING",
      replanRounds: 1,
    });
  });

  it("accepts risk when score below floor and no rounds remaining", () => {
    const lap = { ...baseLap, replanRounds: 2 };
    const assessment = {
      score: 0.5,
      floor: 0.7,
      gaps: [{ severity: "MINOR" as const }],
    } as CoverageAssessment;
    expect(afterCritique(lap, assessment)).toEqual({
      next: "GENERATING",
      acceptedRisk: true,
    });
  });

  it("accepts risk when blocker gap present and no rounds remaining", () => {
    const lap = { ...baseLap, replanRounds: 2 };
    const assessment = {
      score: 0.8,
      floor: 0.7,
      gaps: [{ severity: "BLOCKER" as const }],
    } as CoverageAssessment;
    expect(afterCritique(lap, assessment)).toEqual({
      next: "GENERATING",
      acceptedRisk: true,
    });
  });

  it("replans when blocker gap present and rounds remaining", () => {
    const assessment = {
      score: 0.8,
      floor: 0.7,
      gaps: [{ severity: "BLOCKER" as const }],
    } as CoverageAssessment;
    expect(afterCritique(baseLap, assessment)).toEqual({
      next: "PLANNING",
      replanRounds: 1,
    });
  });
});

describe("healing guards (TG-6, TG-7)", () => {
  const baseLap = {
    id: "lap_00000000",
    healAttempts: {},
  } as Lap;

  it("allows healing for LOCATOR_BREAK with no vetoes and under limits (TG-6)", () => {
    expect(canHeal("LOCATOR_BREAK", [], baseLap, "step_0")).toBe(true);
  });

  it("blocks healing for non-LOCATOR_BREAK kinds", () => {
    expect(canHeal("ASSERTION_FAILURE", [], baseLap, "step_0")).toBe(false);
    expect(canHeal("NAVIGATION_ERROR", [], baseLap, "step_0")).toBe(false);
  });

  it("blocks healing when vetoes present (TG-7)", () => {
    expect(canHeal("LOCATOR_BREAK", ["veto_1"], baseLap, "step_0")).toBe(false);
  });

  it("blocks healing when step attempt limit exceeded (TG-7)", () => {
    const lap = { ...baseLap, healAttempts: { step_0: 2 } };
    expect(canHeal("LOCATOR_BREAK", [], lap, "step_0")).toBe(false);
  });

  it("allows healing when step at limit but total under limit", () => {
    const lap = { ...baseLap, healAttempts: { step_0: 1, step_1: 1 } };
    expect(canHeal("LOCATOR_BREAK", [], lap, "step_0")).toBe(true);
  });

  it("blocks healing when total attempts exceed limit (TG-7)", () => {
    const lap = { ...baseLap, healAttempts: { step_0: 1, step_1: 2 } };
    expect(canHeal("LOCATOR_BREAK", [], lap, "step_0")).toBe(false);
  });
});

describe("exit codes (TG-8, TG-9, TG-10)", () => {
  it("returns 0 for COMPLETED with no defects", () => {
    expect(exitCodeFor("COMPLETED", 0)).toBe(0);
  });
  it("returns 1 for COMPLETED with defects", () => {
    expect(exitCodeFor("COMPLETED", 3)).toBe(1);
  });
  it("returns 1 for COMPLETED_PARTIAL with defects", () => {
    expect(exitCodeFor("COMPLETED_PARTIAL", 1)).toBe(1);
  });
  it("returns 2 for ESCALATED", () => {
    expect(exitCodeFor("ESCALATED", 0)).toBe(2);
    expect(exitCodeFor("ESCALATED", 5)).toBe(2);
  });
  it("returns 3 for ERROR", () => {
    expect(exitCodeFor("ERROR", 0)).toBe(3);
    expect(exitCodeFor("ERROR", 10)).toBe(3);
  });
});
