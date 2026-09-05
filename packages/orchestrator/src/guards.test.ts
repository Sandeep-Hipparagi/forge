import type {
  Capability,
  CapabilityMap,
  CoverageAssessment,
  Diagnosis,
  Lap,
  TestPlan,
} from "@forge/core";
import { describe, expect, it } from "vitest";
import {
  exitCodeFor,
  tg1CanExplore,
  tg2PrepareMap,
  tg3OrderBacklog,
  tg4DependenciesBanked,
  tg5aPlanIsGrounded,
  tg5bOrTg6AfterCritique,
  tg7RunnableScenarios,
  tg8AllRunsTerminal,
  tg9CanHeal,
  tg10Verified,
  tg11ReportingOutcome,
} from "./guards.js";

const at = "2026-01-01T00:00:00.000Z";
const capability: Capability = {
  id: "cap_01j9x2k8",
  sessionId: "ses_01j9x2k4",
  name: "Checkout",
  description: "Complete the checkout flow safely",
  entryStateId: "st_01j9x2k5",
  stateIds: ["st_01j9x2k5"],
  exitConditions: ["Confirmation shown"],
  dependsOn: [],
  risk: {
    score: 0.9,
    factors: {
      authProximity: 1,
      dataMutation: 1,
      moneyOrPii: 1,
      graphCentrality: 0.5,
      affordanceDensity: 0.5,
      statedIntent: 1,
    },
  },
  priorityRank: 0,
};

const map: CapabilityMap = {
  sessionId: capability.sessionId,
  authenticated: false,
  states: [
    {
      id: capability.entryStateId,
      sessionId: capability.sessionId,
      signature: "0123456789abcdef",
      url: "https://shop.test/",
      title: "Shop",
      authRequired: false,
      snapshotEvidenceId: "ev_01j9x3ab",
      affordanceIds: ["af_01j9x2k6"],
      visitedVariants: 1,
      discoveredAt: at,
    },
  ],
  affordances: [
    {
      id: "af_01j9x2k6",
      stateId: capability.entryStateId,
      ref: "e42",
      role: "button",
      accessibleName: "Checkout",
      kind: "button",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    },
  ],
  transitions: [],
  capabilities: [capability],
  apiHints: [],
  frontier: { discovered: 1, explored: 1, haltReason: "EXHAUSTED" },
};

const plan: TestPlan = {
  id: "pln_01j9x3a0",
  lapId: "lap_01j9x2k9",
  capabilityId: capability.id,
  round: 0,
  scenarios: [
    {
      id: "SC-001",
      planId: "pln_01j9x3a0",
      title: "Complete checkout successfully",
      class: "happy",
      priority: "P0",
      priorityReason: "Primary revenue flow",
      preconditions: [],
      steps: [
        {
          id: "s1",
          order: 0,
          kind: "click",
          targetIntent: "Open the checkout",
          stateId: capability.entryStateId,
          affordanceRef: "e42",
          locator: null,
          input: null,
          timeoutMs: 5_000,
          optional: false,
          fingerprintId: null,
          resolvedCount: null,
        },
      ],
      expectedOutcome: "Checkout opens",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
    },
  ],
  markdownPath: "plans/checkout.md",
  createdAt: at,
};

const lap = (replanRounds = 0): Lap => ({
  id: "lap_01j9x2k9",
  sessionId: capability.sessionId,
  capabilityId: capability.id,
  index: 0,
  status: "CRITIQUING",
  outcome: null,
  replanRounds,
  healAttempts: {},
  acceptedRisk: [],
  specPath: null,
  startedAt: at,
  bankedAt: null,
});

const assessment = (
  score: number,
  floor: number,
  severity: "MAJOR" | "BLOCKER" = "MAJOR",
): CoverageAssessment => ({
  id: "cva_01j9x3a1",
  lapId: lap().id,
  planId: plan.id,
  round: 0,
  score,
  floor,
  structural: {
    affordancesExercised: 1,
    affordancesTotal: 1,
    transitionsTraversed: 0,
    transitionsTotal: 0,
    statesReached: 1,
    statesTotal: 1,
    classesPresent: ["happy"],
  },
  gaps: [
    {
      id: "gap_01j9x3a2",
      class: "MISSING_EDGE_CASE",
      title: "Missing edge",
      why: "An important edge case is not covered",
      severity,
      suggestedScenario: "Exercise the missing edge",
      affordanceRefs: [],
    },
  ],
  residualGaps: [],
  prdGaps: [],
  verdict: "REPLAN",
  source: "deterministic",
  createdAt: at,
});

describe("the eleven transition guards", () => {
  it("TG-1 accepts allowlisted HTTP(S), refusing schemes and hosts", () => {
    expect(tg1CanExplore("https://shop.test", ["shop.test"]).allowed).toBe(true);
    expect(tg1CanExplore("file:///etc/passwd", ["shop.test"]).allowed).toBe(false);
    expect(tg1CanExplore("https://other.test", ["shop.test"]).allowed).toBe(false);
  });

  it("TG-2 accepts signed maps and degrades zero capabilities", () => {
    expect(tg2PrepareMap(map).allowed).toBe(true);
    const degraded = tg2PrepareMap({ ...map, capabilities: [] });
    expect(degraded.allowed && degraded.value.capabilities).toHaveLength(1);
    expect(tg2PrepareMap({ ...map, states: [] }).allowed).toBe(false);
  });

  it("TG-3 returns identical deterministic ordering across five calls", () => {
    const lower = { ...capability, id: "cap_01j9x2ka", priorityRank: 1 };
    const input = [lower, capability];
    const runs = Array.from({ length: 5 }, () => tg3OrderBacklog(input).map(({ id }) => id));
    expect(new Set(runs.map((run) => JSON.stringify(run)))).toHaveProperty("size", 1);
    expect(runs[0]).toEqual([capability.id, lower.id]);
  });

  it("TG-4 starts only after every dependency is banked", () => {
    const dependent = { ...capability, dependsOn: ["cap_01j9x2ka"] };
    expect(tg4DependenciesBanked(dependent, new Set(["cap_01j9x2ka"]))).toBe(true);
    expect(tg4DependenciesBanked(dependent, new Set())).toBe(false);
  });

  it("TG-5a accepts grounded plans and refuses invented affordances", () => {
    expect(tg5aPlanIsGrounded(plan, map).allowed).toBe(true);
    const invented = structuredClone(plan);
    invented.scenarios[0]!.steps[0]!.affordanceRef = "e99";
    expect(tg5aPlanIsGrounded(invented, map).allowed).toBe(false);
  });

  it("TG-5b requires an assessment, floor, and zero blockers", () => {
    expect(tg5bOrTg6AfterCritique(lap(), null).allowed).toBe(false);
    expect(tg5bOrTg6AfterCritique(lap(), assessment(1, 0.8, "BLOCKER"))).toEqual(
      expect.objectContaining({
        allowed: true,
        value: expect.objectContaining({ next: "PLANNING" }),
      }),
    );
    expect(tg5bOrTg6AfterCritique(lap(), assessment(0.7, 0.8))).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({ next: "PLANNING" }),
      }),
    );
    expect(tg5bOrTg6AfterCritique(lap(), { ...assessment(0.9, 0.8), gaps: [] })).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({ next: "GENERATING" }),
      }),
    );
  });

  it("TG-6 refuses a third replan and records accepted risk", () => {
    expect(tg5bOrTg6AfterCritique(lap(2), assessment(0.5, 0.8))).toEqual(
      expect.objectContaining({
        value: expect.objectContaining({
          next: "GENERATING",
          acceptedRisk: expect.any(Array),
        }),
      }),
    );
  });

  it("TG-7 drops non-unique locators rather than taking the first", () => {
    expect(
      tg7RunnableScenarios([
        { scenarioId: "SC-001", resolvedCounts: [1], assertionsPassed: true },
        { scenarioId: "SC-002", resolvedCounts: [2], assertionsPassed: true },
      ]),
    ).toEqual({ runnable: ["SC-001"], dropped: ["SC-002"] });
  });

  it("TG-8 treats FLAKY as terminal and refuses an active run", () => {
    expect(tg8AllRunsTerminal([{ status: "FLAKY" }])).toBe(true);
    expect(tg8AllRunsTerminal([{ status: "RUNNING" }])).toBe(false);
    expect(tg8AllRunsTerminal([])).toBe(false);
  });

  it("TG-9 heals only locator breaks with no veto and both caps available", () => {
    const diagnosis = { kind: "LOCATOR_BREAK", vetoes: [] } satisfies Pick<
      Diagnosis,
      "kind" | "vetoes"
    >;
    expect(tg9CanHeal(diagnosis, 1, 2)).toBe(true);
    expect(tg9CanHeal({ ...diagnosis, kind: "PRODUCT_BUG" }, 1, 2)).toBe(false);
    expect(tg9CanHeal({ ...diagnosis, vetoes: ["V1"] }, 1, 2)).toBe(false);
    expect(tg9CanHeal(diagnosis, 2, 2)).toBe(false);
    expect(tg9CanHeal(diagnosis, 1, 3)).toBe(false);
  });

  it("TG-10 verifies only both reruns and refuses partial verification", () => {
    expect(tg10Verified({ healedStepRerun: true, fullFlowRerun: true }).allowed).toBe(true);
    expect(tg10Verified({ healedStepRerun: true, fullFlowRerun: false }).allowed).toBe(false);
  });

  it("TG-11 reports on empty backlog or budget and marks budget partial", () => {
    expect(tg11ReportingOutcome(0, false)).toEqual({
      allowed: true,
      value: "COMPLETED",
    });
    expect(tg11ReportingOutcome(2, true)).toEqual({
      allowed: true,
      value: "COMPLETED_PARTIAL",
    });
    expect(tg11ReportingOutcome(2, false).allowed).toBe(false);
  });
});

describe("terminal exit codes", () => {
  it.each([
    ["COMPLETED", 0, 0],
    ["COMPLETED", 1, 1],
    ["COMPLETED_PARTIAL", 0, 0],
    ["COMPLETED_PARTIAL", 2, 1],
    ["ESCALATED", 0, 2],
    ["ERROR", 0, 3],
  ] as const)("%s with %s defects exits %s", (status, defects, expected) => {
    expect(exitCodeFor(status, defects)).toBe(expected);
  });
});
