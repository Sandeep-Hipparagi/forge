import { describe, expect, it } from "vitest";
import {
  identityKey,
  mergeScenarios,
  ground,
  applyPriorityCeiling,
  fallbackPlan,
  renderPlan,
} from "../src/index.js";
import type { CapabilitySubgraph, Capability, Scenario } from "@forge/core";
import type { ScenarioDraft, TestPlanDraft } from "../src/types.js";

const mockSubgraph: CapabilitySubgraph = {
  states: [
    {
      id: "st_1",
      signature: "sig1",
      url: "/checkout",
      title: "Checkout",
      snapshotYaml: "",
    },
    {
      id: "st_2",
      signature: "sig2",
      url: "/checkout/payment",
      title: "Payment",
      snapshotYaml: "",
    },
    {
      id: "st_3",
      signature: "sig3",
      url: "/order/123",
      title: "Order Confirmed",
      snapshotYaml: "",
    },
    {
      id: "st_4",
      signature: "sig4",
      url: "/error",
      title: "Error",
      snapshotYaml: "",
    },
  ],
  transitions: [
    {
      id: "tr_1",
      sessionId: "ses_1",
      fromStateId: "st_1",
      toStateId: "st_2",
      viaAffordanceId: "af_1",
      action: "click",
      observedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "tr_2",
      sessionId: "ses_1",
      fromStateId: "st_2",
      toStateId: "st_3",
      viaAffordanceId: "af_2",
      action: "click",
      observedAt: "2026-01-01T00:00:00Z",
    },
  ],
  affordances: [
    {
      id: "af_1",
      stateId: "st_1",
      ref: "e1",
      role: "button",
      accessibleName: "Continue",
      kind: "button",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
    {
      id: "af_2",
      stateId: "st_2",
      ref: "e2",
      role: "button",
      accessibleName: "Place order",
      kind: "button",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
    {
      id: "af_3",
      stateId: "st_1",
      ref: "e3",
      role: "textbox",
      accessibleName: "Card number",
      kind: "textbox",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
  ],
  entryStateId: "st_1",
  exitConditions: ["Order Confirmed reached"],
  subgraphTruncated: false,
};

const mockCapability: Capability = {
  id: "cap_1",
  sessionId: "ses_1",
  name: "Checkout",
  description: "Guest and signed-in purchase",
  entryStateId: "st_1",
  stateIds: ["st_1", "st_2", "st_3"],
  exitConditions: ["Order Confirmed reached"],
  dependsOn: [],
  risk: {
    score: 0.88,
    factors: {
      authProximity: 0.6,
      dataMutation: 1.0,
      moneyOrPii: 1.0,
      graphCentrality: 0.72,
      affordanceDensity: 0.83,
      statedIntent: 0,
    },
  },
  priorityRank: 0,
};

function makeDraftScenario(
  overrides: Partial<ScenarioDraft> = {},
): ScenarioDraft {
  return {
    id: overrides.id ?? "SC-001",
    title: overrides.title ?? "Test Scenario",
    class: overrides.class ?? "happy",
    priority: overrides.priority ?? "P0",
    priorityReason: overrides.priorityReason ?? "test",
    preconditions: overrides.preconditions ?? [],
    steps: overrides.steps ?? [
      {
        id: "s0",
        order: 0,
        kind: "navigate",
        targetIntent: "open checkout",
        stateId: "st_1",
        affordanceRef: null,
        locatorStrategy: null,
        locatorArgs: null,
        input: null,
        timeoutMs: 5000,
        optional: false,
      },
      {
        id: "s1",
        order: 1,
        kind: "click",
        targetIntent: "continue",
        stateId: "st_1",
        affordanceRef: "e1",
        locatorStrategy: "role_name",
        locatorArgs: { role: "button", name: "Continue" },
        input: null,
        timeoutMs: 5000,
        optional: false,
      },
      {
        id: "s2",
        order: 2,
        kind: "assertText",
        targetIntent: "confirm",
        stateId: "st_2",
        affordanceRef: null,
        locatorStrategy: null,
        locatorArgs: null,
        input: "Order confirmed",
        timeoutMs: 5000,
        optional: false,
      },
    ],
    expectedOutcome: overrides.expectedOutcome ?? "Order confirmed",
    source: overrides.source ?? "agent",
    sourceRefs: overrides.sourceRefs ?? [],
    plannedNotGenerated: overrides.plannedNotGenerated ?? false,
    notGeneratedReason: overrides.notGeneratedReason ?? null,
    rationale: overrides.rationale ?? "",
  };
}

function makeDraft(overrides: Partial<TestPlanDraft> = {}): TestPlanDraft {
  return {
    scenarios: overrides.scenarios ?? [makeDraftScenario()],
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: overrides.id ?? "SC-001",
    planId: overrides.planId ?? "pln_1",
    version: overrides.version ?? 1,
    title: overrides.title ?? "Test Scenario",
    class: overrides.class ?? "happy",
    priority: overrides.priority ?? "P0",
    priorityReason: overrides.priorityReason ?? "test",
    preconditions: overrides.preconditions ?? [],
    steps: overrides.steps ?? [
      {
        id: "s0",
        order: 0,
        kind: "navigate",
        targetIntent: "open checkout",
        stateId: "st_1",
        affordanceRef: null,
        locator: null,
        input: null,
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount: null,
      },
      {
        id: "s1",
        order: 1,
        kind: "click",
        targetIntent: "continue",
        stateId: "st_1",
        affordanceRef: "e1",
        locator: "getByRole('button', { name: 'Continue' })",
        input: null,
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount: null,
      },
      {
        id: "s2",
        order: 2,
        kind: "assertText",
        targetIntent: "confirm",
        stateId: "st_2",
        affordanceRef: null,
        locator: null,
        input: "Order confirmed",
        timeoutMs: 5000,
        optional: false,
        fingerprintId: null,
        resolvedCount: null,
      },
    ],
    expectedOutcome: overrides.expectedOutcome ?? "Order confirmed",
    source: overrides.source ?? "agent",
    sourceRefs: overrides.sourceRefs ?? [],
    plannedNotGenerated: overrides.plannedNotGenerated ?? false,
    notGeneratedReason: overrides.notGeneratedReason ?? null,
    rationale: overrides.rationale ?? "",
  };
}

describe("planner", () => {
  describe("identityKey", () => {
    it("produces stable 16-char hex", () => {
      const scenario = makeDraftScenario({
        id: "SC-001",
        title: "Guest checkout",
        class: "happy",
      });
      const key1 = identityKey(scenario);
      const key2 = identityKey(scenario);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{16}$/);
    });

    it("different scenarios produce different keys", () => {
      const s1 = makeDraftScenario({
        id: "SC-001",
        title: "Scenario A",
        class: "happy",
      });
      const s2 = makeDraftScenario({
        id: "SC-002",
        title: "Scenario B",
        class: "happy",
      });
      expect(identityKey(s1)).not.toBe(identityKey(s2));
    });
  });

  describe("ground", () => {
    it("passes valid draft with all checks", () => {
      const draft = makeDraft();
      const result = ground(draft, mockSubgraph, []);
      // retry is true when fewer than 3 scenarios survive
      expect(result.retry).toBe(true);
      expect(result.dropped.length).toBe(0);
      expect(result.plan.scenarios.length).toBe(1);
    });

    it("drops scenario with UNKNOWN_STATE", () => {
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "open",
                stateId: "st_999",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "assertText",
                targetIntent: "confirm",
                stateId: "st_2",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: "ok",
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      expect(result.dropped.some((d) => d.reason === "UNKNOWN_STATE")).toBe(
        true,
      );
      expect(result.plan.scenarios.length).toBe(0);
    });

    it("drops scenario with UNKNOWN_AFFORDANCE", () => {
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "open",
                stateId: "st_1",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "click",
                targetIntent: "click",
                stateId: "st_1",
                affordanceRef: "e999",
                locatorStrategy: "role_name",
                locatorArgs: { role: "button", name: "Ghost" },
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s2",
                order: 2,
                kind: "assertText",
                targetIntent: "confirm",
                stateId: "st_2",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: "ok",
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      expect(
        result.dropped.some((d) => d.reason === "UNKNOWN_AFFORDANCE"),
      ).toBe(true);
    });

    it("drops scenario with KIND_MISMATCH", () => {
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "open",
                stateId: "st_1",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "fill",
                targetIntent: "fill button",
                stateId: "st_1",
                affordanceRef: "e1",
                locatorStrategy: "role_name",
                locatorArgs: { role: "button", name: "Continue" },
                input: "test",
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s2",
                order: 2,
                kind: "assertText",
                targetIntent: "confirm",
                stateId: "st_2",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: "ok",
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      expect(result.dropped.some((d) => d.reason === "KIND_MISMATCH")).toBe(
        true,
      );
    });

    it("drops scenario with NO_ASSERTION", () => {
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "open",
                stateId: "st_1",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "click",
                targetIntent: "continue",
                stateId: "st_1",
                affordanceRef: "e1",
                locatorStrategy: "role_name",
                locatorArgs: { role: "button", name: "Continue" },
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      expect(result.dropped.some((d) => d.reason === "NO_ASSERTION")).toBe(
        true,
      );
    });

    it("sets retry when fewer than 3 scenarios survive", () => {
      const draft = makeDraft();
      const result = ground(draft, mockSubgraph, []);
      expect(result.retry).toBe(true);
    });

    it("does not retry when 3+ scenarios survive", () => {
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({ id: "SC-001", title: "Happy", class: "happy" }),
          makeDraftScenario({
            id: "SC-002",
            title: "Negative",
            class: "negative",
          }),
          makeDraftScenario({
            id: "SC-003",
            title: "Boundary",
            class: "boundary",
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      expect(result.retry).toBe(false);
    });

    it("allows reachable state as first step", () => {
      // st_2 is reachable from st_1 via transition tr_1
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "open payment",
                stateId: "st_2",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "click",
                targetIntent: "place order",
                stateId: "st_2",
                affordanceRef: "e2",
                locatorStrategy: "role_name",
                locatorArgs: { role: "button", name: "Place order" },
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s2",
                order: 2,
                kind: "assertText",
                targetIntent: "confirm",
                stateId: "st_3",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: "ok",
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, mockSubgraph, []);
      // st_2 is reachable from st_1, so should not drop
      expect(result.dropped.some((d) => d.reason === "UNREACHABLE_START")).toBe(
        false,
      );
      expect(result.plan.scenarios.length).toBe(1);
    });

    it("drops scenario with truly unreachable start state", () => {
      // Use a state that exists but is not reachable from entry
      // Add an isolated state to the subgraph for this test
      const isolatedSubgraph = {
        ...mockSubgraph,
        states: [
          ...mockSubgraph.states,
          {
            id: "st_999",
            signature: "sig999",
            url: "/isolated",
            title: "Isolated",
            snapshotYaml: "",
          },
        ],
        transitions: mockSubgraph.transitions, // No transition to st_999
      };
      const draft = makeDraft({
        scenarios: [
          makeDraftScenario({
            steps: [
              {
                id: "s0",
                order: 0,
                kind: "navigate",
                targetIntent: "go to isolated",
                stateId: "st_999",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: null,
                timeoutMs: 5000,
                optional: false,
              },
              {
                id: "s1",
                order: 1,
                kind: "assertText",
                targetIntent: "confirm",
                stateId: "st_999",
                affordanceRef: null,
                locatorStrategy: null,
                locatorArgs: null,
                input: "ok",
                timeoutMs: 5000,
                optional: false,
              },
            ],
          }),
        ],
      });
      const result = ground(draft, isolatedSubgraph, []);
      expect(result.dropped.some((d) => d.reason === "UNREACHABLE_START")).toBe(
        true,
      );
    });
  });

  describe("mergeScenarios", () => {
    it("preserves IDs for exact key matches", () => {
      const round0 = [
        makeScenario({
          id: "SC-001",
          title: "Guest checkout",
          class: "happy",
        }),
      ];
      const round1 = [
        makeScenario({
          id: "SC-001",
          title: "Guest checkout",
          class: "happy",
        }),
      ];
      const merged = mergeScenarios([round0], round1);
      expect(merged[0]!.id).toBe("SC-001");
    });

    it("reuses ID for similarity >= 0.8", () => {
      const round0 = [
        makeScenario({
          id: "SC-001",
          title: "Checkout applies tax",
          class: "happy",
        }),
      ];
      const round1 = [
        makeScenario({
          id: "SC-002",
          title: "Checkout applies tax and shipping",
          class: "happy",
        }),
      ];
      const merged = mergeScenarios([round0], round1);
      expect(merged[0]!.id).toBe("SC-001");
    });

    it("allocates new ID for new scenarios continuing from highest", () => {
      const round0 = [
        makeScenario({ id: "SC-005", title: "Existing", class: "happy" }),
      ];
      const round1 = [
        makeScenario({
          id: "SC-002",
          title: "Brand new scenario",
          class: "happy",
        }),
      ];
      const merged = mergeScenarios([round0], round1);
      // mergeScenarios returns only the new scenarios with resolved IDs
      expect(merged.length).toBe(1);
      expect(merged[0]!.id).toBe("SC-006");
    });
  });

  describe("applyPriorityCeiling", () => {
    it("clamps model priority to ceiling when model is weaker", () => {
      const scenario = makeScenario({
        priority: "P2",
        priorityReason: "model reason",
      });
      const { priority, priorityReason } = applyPriorityCeiling(
        scenario,
        mockCapability,
      );
      expect(priority).toBe("P0");
      expect(priorityReason).toContain("capability risk");
    });

    it("allows model to argue down to weaker priority", () => {
      const scenario = makeScenario({
        priority: "P0",
        priorityReason: "model reason",
      });
      const lowRiskCap = {
        ...mockCapability,
        risk: { ...mockCapability.risk, score: 0.3 },
      };
      const { priority } = applyPriorityCeiling(scenario, lowRiskCap);
      // ceiling is P3, model P0 is stronger, so model wins
      expect(priority).toBe("P0");
    });

    it("uses ceiling when model is weaker", () => {
      const scenario = makeScenario({
        priority: "P3",
        priorityReason: "model reason",
      });
      const { priority } = applyPriorityCeiling(scenario, mockCapability);
      // ceiling P0, model P3 is weaker, so ceiling wins
      expect(priority).toBe("P0");
    });
  });

  describe("fallbackPlan", () => {
    it("produces scenarios for all four classes when error state exists", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      const classes = plan.scenarios.map((s) => s.class).sort();
      expect(classes).toEqual(["boundary", "error_state", "happy", "negative"]);
    });

    it("marks fallback scenarios with rationale", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      for (const scenario of plan.scenarios) {
        expect(scenario.rationale).toContain("Deterministic fallback");
      }
    });

    it("marks fallback source as agent", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      for (const scenario of plan.scenarios) {
        expect(scenario.source).toBe("agent");
      }
    });
  });

  describe("renderPlan", () => {
    it("outputs valid markdown with capability header", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      const md = renderPlan(plan, mockCapability);
      expect(md).toContain("# Checkout — Test Plan");
      expect(md).toContain("**Capability.** Guest and signed-in purchase");
      expect(md).toContain("**Risk.** 0.880");
    });

    it("includes scenario table with steps", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      const md = renderPlan(plan, mockCapability);
      expect(md).toContain("| # | Action | Intent | State | Affordance |");
      expect(md).toContain("navigate");
      expect(md).toContain("assertVisible");
    });

    it("sorts scenarios by priority then id", () => {
      const plan = fallbackPlan(mockSubgraph, mockCapability);
      const md = renderPlan(plan, mockCapability);
      const sc001 = md.indexOf("SC-001");
      const sc002 = md.indexOf("SC-002");
      expect(sc001).toBeLessThan(sc002);
    });
  });
});
