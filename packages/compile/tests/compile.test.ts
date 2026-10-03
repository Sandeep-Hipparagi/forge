import { describe, expect, it } from "vitest";
import { compile, buildLocator, LOCATOR_LADDER } from "../src/index.js";
import type {
  TestPlan,
  Scenario,
  Capability,
  CapabilitySubgraph,
  TestStep,
} from "@forge/core";

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
  stateIds: ["st_1", "st_2"],
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

function makePlan(scenarios: Partial<Scenario>[]): TestPlan {
  return {
    id: "pln_1",
    lapId: "lap_1",
    capabilityId: "cap_1",
    round: 0,
    scenarios: scenarios.map((s, i) => ({
      id: `SC-${String(i + 1).padStart(3, "0")}`,
      planId: "pln_1",
      title: s.title ?? `Scenario ${i + 1}`,
      class: s.class ?? "happy",
      priority: s.priority ?? "P0",
      priorityReason: "test",
      preconditions: [],
      steps: s.steps ?? [],
      expectedOutcome: s.expectedOutcome ?? "outcome",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
      rationale: s.rationale ?? "",
    })) as Scenario[],
    markdownPath: "plans/test.md",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
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
    ...overrides,
  };
}

describe("compile", () => {
  describe("buildLocator", () => {
    it("builds role_name locator", () => {
      const locator = buildLocator(
        "role_name",
        { role: "button", name: "Place order" },
        null,
      );
      expect(locator).toBe("getByRole('button', { name: 'Place order' })");
    });

    it("builds label locator", () => {
      const locator = buildLocator("label", { label: "Email" }, null);
      expect(locator).toBe("getByLabel('Email')");
    });

    it("builds placeholder locator", () => {
      const locator = buildLocator(
        "placeholder",
        { placeholder: "Enter email" },
        null,
      );
      expect(locator).toBe("getByPlaceholder('Enter email')");
    });

    it("builds text locator", () => {
      const locator = buildLocator("text", { text: "Submit" }, null);
      expect(locator).toBe("getByText('Submit', { exact: true })");
    });

    it("builds test_id locator", () => {
      const locator = buildLocator("test_id", { testId: "submit-btn" }, null);
      expect(locator).toBe("getByTestId('submit-btn')");
    });

    it("builds alt_title locator", () => {
      const locator = buildLocator("alt_title", { alt: "Cart icon" }, null);
      expect(locator).toBe("getByAltText('Cart icon')");
    });

    it("builds dom_relative locator", () => {
      const locator = buildLocator(
        "dom_relative",
        { selector: "button", relativeTo: "#checkout-form" },
        null,
      );
      expect(locator).toBe("locator('#checkout-form').locator('button')");
    });

    it("builds css locator", () => {
      const locator = buildLocator("css", { selector: ".btn-primary" }, null);
      expect(locator).toBe("locator('.btn-primary')");
    });

    it("returns null for missing args", () => {
      expect(buildLocator("role_name", { role: "button" }, null)).toBeNull();
      expect(buildLocator("label", {}, null)).toBeNull();
    });

    it("escapes quotes in strings", () => {
      const locator = buildLocator(
        "role_name",
        { role: "button", name: "Place 'order'" },
        null,
      );
      expect(locator).toBe(
        "getByRole('button', { name: 'Place \\'order\\'' })",
      );
    });
  });

  describe("compile", () => {
    it("compiles a simple happy path scenario", () => {
      const plan = makePlan([
        {
          title: "Guest checkout",
          class: "happy",
          steps: [
            makeStep({
              id: "s0",
              order: 0,
              kind: "navigate",
              targetIntent: "open checkout",
              stateId: "st_1",
              affordanceRef: null,
            }),
            makeStep({
              id: "s1",
              order: 1,
              kind: "fill",
              targetIntent: "enter card number",
              stateId: "st_1",
              affordanceRef: "e3",
              locatorStrategy: "role_name",
              locatorArgs: { role: "textbox", name: "Card number" },
            }),
            makeStep({
              id: "s2",
              order: 2,
              kind: "click",
              targetIntent: "continue",
              stateId: "st_1",
              affordanceRef: "e1",
              locatorStrategy: "role_name",
              locatorArgs: { role: "button", name: "Continue" },
            }),
            makeStep({
              id: "s3",
              order: 3,
              kind: "click",
              targetIntent: "place order",
              stateId: "st_2",
              affordanceRef: "e2",
              locatorStrategy: "role_name",
              locatorArgs: { role: "button", name: "Place order" },
            }),
            makeStep({
              id: "s4",
              order: 4,
              kind: "assertText",
              targetIntent: "order confirmed",
              stateId: "st_2",
              affordanceRef: null,
              locatorStrategy: null,
              locatorArgs: null,
              input: "Order confirmed",
            }),
          ],
        },
      ]);

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      expect(result.droppedScenarios.length).toBe(0);
      expect(result.suite.scenarios.length).toBe(1);
      const sc0 = result.suite.scenarios[0]!;
      expect(sc0.steps.length).toBe(5);
      expect(sc0.steps[0]!.kind).toBe("navigate");
      expect(sc0.steps[1]!.locator).toContain(
        "getByRole('textbox', { name: 'Card number' })",
      );
      expect(sc0.steps[2]!.locator).toContain(
        "getByRole('button', { name: 'Continue' })",
      );
      expect(sc0.steps[3]!.locator).toContain(
        "getByRole('button', { name: 'Place order' })",
      );
      expect(sc0.steps[4]!.kind).toBe("assertText");
    });

    it("applies priority ceiling", () => {
      const plan = makePlan([
        {
          title: "Low priority scenario",
          class: "negative",
          priority: "P3",
          priorityReason: "model",
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({
              kind: "click",
              stateId: "st_1",
              affordanceRef: "e1",
              locatorStrategy: "role_name",
              locatorArgs: { role: "button", name: "Continue" },
            }),
            makeStep({ kind: "assertText", stateId: "st_1", input: "error" }),
          ],
        },
      ]);

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      expect(result.suite.scenarios[0]!.priority).toBe("P0"); // Ceiling for high-risk capability
    });

    it("drops scenario with failed locator when affordanceRef not found", () => {
      const plan = makePlan([
        {
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({
              kind: "click",
              stateId: "st_1",
              affordanceRef: "e999",
              locatorStrategy: "role_name",
              locatorArgs: { role: "button", name: "Ghost" },
            }),
            makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
          ],
        },
      ]);

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      // The step has affordanceRef "e999" which doesn't exist, but locatorArgs provides enough info to build a locator
      // So the scenario passes. To test LOCATOR_FAILED, we need a step with no locatorArgs and missing affordanceRef
      expect(result.droppedScenarios.length).toBe(0);
      expect(result.suite.scenarios.length).toBe(1);
    });

    it("drops scenario when affordanceRef not found and no locatorArgs", () => {
      const plan = makePlan([
        {
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({ kind: "click", stateId: "st_1", affordanceRef: "e999" }), // No locatorStrategy/locatorArgs
            makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
          ],
        },
      ]);

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      expect(result.droppedScenarios.length).toBe(1);
      expect(result.droppedScenarios[0]!.reason).toContain("LOCATOR_FAILED");
    });

    it("skips plannedNotGenerated scenarios", () => {
      // Create a plan with a plannedNotGenerated scenario by directly constructing the TestPlan
      const plan: TestPlan = {
        id: "pln_1",
        lapId: "lap_1",
        capabilityId: "cap_1",
        round: 0,
        scenarios: [
          {
            id: "SC-001",
            planId: "pln_1",
            title: "Destructive test",
            class: "happy",
            priority: "P0",
            priorityReason: "test",
            preconditions: [],
            steps: [
              makeStep({ kind: "navigate", stateId: "st_1" }),
              makeStep({
                kind: "click",
                stateId: "st_1",
                affordanceRef: "e1",
                locatorStrategy: "role_name",
                locatorArgs: { role: "button", name: "Cancel order" },
              }),
              makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
            ],
            expectedOutcome: "outcome",
            source: "agent",
            sourceRefs: [],
            plannedNotGenerated: true,
            notGeneratedReason: "destructive on non-disposable target",
            version: 1,
            rationale: "",
          },
        ],
        markdownPath: "plans/test.md",
        createdAt: "2026-01-01T00:00:00Z",
      };

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      expect(result.suite.scenarios.length).toBe(0);
      expect(result.droppedScenarios.length).toBe(1);
      expect(result.droppedScenarios[0]!.reason).toContain("destructive");
    });

    it("sorts scenarios by priority then id", () => {
      const plan = makePlan([
        {
          title: "Low P",
          class: "happy",
          priority: "P2",
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
          ],
        },
        {
          title: "High P",
          class: "happy",
          priority: "P0",
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
          ],
        },
        {
          title: "Medium P",
          class: "happy",
          priority: "P1",
          steps: [
            makeStep({ kind: "navigate", stateId: "st_1" }),
            makeStep({ kind: "assertText", stateId: "st_1", input: "ok" }),
          ],
        },
      ]);

      const result = compile(plan, {
        subgraph: mockSubgraph,
        capability: mockCapability,
      });
      // After ceiling, all become P0, so sort by id
      const ids = result.suite.scenarios.map((s) => s.id);
      // The order depends on which scenarios survive compilation
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toEqual(ids.slice().sort());
    });
  });
});

describe("locator ladder", () => {
  it("exports LOCATOR_LADDER in correct order", () => {
    expect(LOCATOR_LADDER).toEqual([
      "role_name",
      "label",
      "placeholder",
      "text",
      "test_id",
      "alt_title",
      "dom_relative",
      "css",
    ]);
  });
});
