import type { Affordance, Scenario, TestPlan, TestStep } from "../schema/index.js";

const AT = "2026-01-01T00:00:00.000Z";
const STATE_CART = "st_01j9cmp01";
const STATE_DONE = "st_01j9cmp02";

/**
 * Minimal one-capability fixture plan for Ph4 compile/run tests.
 * Locators resolve against the HTML fixture in `packages/runner` tests — no target literals.
 */
export function compileFixturePlan(): {
  plan: TestPlan;
  affordances: Affordance[];
  states: { id: string; url: string }[];
  capabilityName: string;
} {
  const affordances: Affordance[] = [
    {
      id: "af_01j9cmp01",
      stateId: STATE_CART,
      ref: "e1",
      role: "textbox",
      accessibleName: "Full name",
      kind: "textbox",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    },
    {
      id: "af_01j9cmp02",
      stateId: STATE_CART,
      ref: "e2",
      role: "button",
      accessibleName: "Continue",
      kind: "button",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    },
    {
      id: "af_01j9cmp03",
      stateId: STATE_DONE,
      ref: "e3",
      role: "heading",
      accessibleName: "Order confirmed",
      kind: "other",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    },
  ];

  const states = [
    { id: STATE_CART, url: "https://example.test/cart" },
    { id: STATE_DONE, url: "https://example.test/done" },
  ];

  const planId = "pln_01j9cmp01";
  const step = (
    id: string,
    order: number,
    kind: TestStep["kind"],
    stateId: string,
    affordanceRef: string | null,
    intent: string,
    input: string | null = null,
  ): TestStep => ({
    id,
    order,
    kind,
    targetIntent: intent,
    stateId,
    affordanceRef,
    locator: null,
    input,
    timeoutMs: 5_000,
    optional: false,
    fingerprintId: null,
    resolvedCount: null,
  });

  const scenario: Scenario = {
    id: "SC-001",
    planId,
    title: "Guest checkout with a valid name",
    class: "happy",
    priority: "P0",
    priorityReason: "happy path",
    preconditions: [],
    steps: [
      step("s1", 0, "navigate", STATE_CART, null, "open cart"),
      step("s2", 1, "fill", STATE_CART, "e1", "enter full name", "Ada Lovelace"),
      step("s3", 2, "click", STATE_CART, "e2", "continue"),
      step("s4", 3, "assertVisible", STATE_DONE, "e3", "confirmation heading visible"),
    ],
    expectedOutcome: "Order confirmed heading is visible",
    source: "agent",
    sourceRefs: [],
    plannedNotGenerated: false,
    notGeneratedReason: null,
    version: 1,
  };

  const plan: TestPlan = {
    id: planId,
    lapId: "lap_01j9cmp01",
    capabilityId: "cap_01j9cmp01",
    round: 1,
    scenarios: [scenario],
    markdownPath: "plans/checkout-fixture.md",
    createdAt: AT,
  };

  return { plan, affordances, states, capabilityName: "Checkout" };
}
