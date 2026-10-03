import { describe, expect, it } from "vitest";
import { classGaps } from "../src/class-gaps.js";
import type { TestPlan, Scenario, CapabilitySubgraph } from "@forge/core";

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
    {
      id: "af_4",
      stateId: "st_1",
      ref: "e4",
      role: "button",
      accessibleName: "Cancel order",
      kind: "button",
      enabled: true,
      destructive: true,
      observedNotExercised: true,
      notExercisedReason: "DENY_LIST",
      bbox: null,
    },
    // Additional affordances for 3+ untouched test
    {
      id: "af_5",
      stateId: "st_1",
      ref: "e5",
      role: "textbox",
      accessibleName: "Coupon code",
      kind: "textbox",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
    {
      id: "af_6",
      stateId: "st_1",
      ref: "e6",
      role: "button",
      accessibleName: "Apply coupon",
      kind: "button",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
    {
      id: "af_7",
      stateId: "st_1",
      ref: "e7",
      role: "textbox",
      accessibleName: "Gift card",
      kind: "textbox",
      enabled: true,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      bbox: null,
    },
    {
      id: "af_8",
      stateId: "st_2",
      ref: "e8",
      role: "textbox",
      accessibleName: "CVV",
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
      priority: "P0",
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

describe("classGaps", () => {
  it("mints BLOCKER for missing negative class", () => {
    const plan = makePlan([
      { class: "happy", steps: [] },
      { class: "boundary", steps: [] },
      { class: "error_state", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const negativeGap = gaps.find(
      (g) => g.class === "MISSING_EDGE_CASE" && g.title.includes("negative"),
    );
    expect(negativeGap).toBeDefined();
    expect(negativeGap?.severity).toBe("BLOCKER");
  });

  it("mints BLOCKER for missing error_state class", () => {
    const plan = makePlan([
      { class: "happy", steps: [] },
      { class: "negative", steps: [] },
      { class: "boundary", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const errorGap = gaps.find((g) => g.class === "MISSING_ERROR_STATE");
    expect(errorGap).toBeDefined();
    expect(errorGap?.severity).toBe("BLOCKER");
  });

  it("mints MAJOR for missing boundary class", () => {
    const plan = makePlan([
      { class: "happy", steps: [] },
      { class: "negative", steps: [] },
      { class: "error_state", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const boundaryGap = gaps.find(
      (g) => g.class === "MISSING_EDGE_CASE" && g.title.includes("boundary"),
    );
    expect(boundaryGap).toBeDefined();
    expect(boundaryGap?.severity).toBe("MAJOR");
  });

  it("does not mint gap when class has stated rationale", () => {
    const plan = makePlan([
      {
        class: "happy",
        steps: [],
        rationale: "This is a read-only capability; no negative case applies",
      },
      {
        class: "boundary",
        steps: [],
        rationale: "error_state: not applicable",
      },
      { class: "error_state", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const negativeGap = gaps.find(
      (g) => g.class === "MISSING_EDGE_CASE" && g.title.includes("negative"),
    );
    expect(negativeGap).toBeUndefined();
  });

  it("mints BLOCKER when primary flow not covered end-to-end", () => {
    const plan = makePlan([
      {
        class: "happy",
        steps: [
          {
            id: "s0",
            order: 0,
            kind: "navigate",
            targetIntent: "open",
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
            locator: null,
            input: null,
            timeoutMs: 5000,
            optional: false,
            fingerprintId: null,
            resolvedCount: null,
          },
        ],
      },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const flowGap = gaps.find((g) => g.title.includes("Primary flow"));
    expect(flowGap).toBeDefined();
    expect(flowGap?.severity).toBe("BLOCKER");
  });

  it("mints MAJOR for 3+ untouched affordances in a state", () => {
    const plan = makePlan([
      { class: "happy", steps: [] },
      { class: "negative", steps: [] },
      { class: "error_state", steps: [] },
      { class: "boundary", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const untouchedGap = gaps.find(
      (g) => g.severity === "MAJOR" && g.title.includes("untouched"),
    );
    expect(untouchedGap).toBeDefined();
  });

  it("mints MAJOR for unreached state", () => {
    const plan = makePlan([
      {
        class: "happy",
        steps: [
          {
            id: "s0",
            order: 0,
            kind: "navigate",
            targetIntent: "open",
            stateId: "st_1",
            affordanceRef: null,
            locator: null,
            input: null,
            timeoutMs: 5000,
            optional: false,
            fingerprintId: null,
            resolvedCount: null,
          },
        ],
      },
      { class: "negative", steps: [] },
      { class: "error_state", steps: [] },
      { class: "boundary", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const unreachedGap = gaps.find(
      (g) => g.title.includes("Unreached state") && g.title.includes("Payment"),
    );
    expect(unreachedGap).toBeDefined();
    expect(unreachedGap?.severity).toBe("MAJOR");
  });

  it("mints MINOR for single untouched eligible affordance", () => {
    const plan = makePlan([
      {
        class: "happy",
        steps: [
          {
            id: "s0",
            order: 0,
            kind: "navigate",
            targetIntent: "open",
            stateId: "st_1",
            affordanceRef: null,
            locator: null,
            input: null,
            timeoutMs: 5000,
            optional: false,
            fingerprintId: null,
            resolvedCount: null,
          },
        ],
      },
      { class: "negative", steps: [] },
      { class: "error_state", steps: [] },
      { class: "boundary", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const minorGaps = gaps.filter(
      (g) => g.severity === "MINOR" && g.class === "MISSING_FLOW",
    );
    expect(minorGaps.length).toBeGreaterThan(0);
  });

  it("mints MINOR for deny-listed affordance", () => {
    const plan = makePlan([
      { class: "happy", steps: [] },
      { class: "negative", steps: [] },
      { class: "error_state", steps: [] },
      { class: "boundary", steps: [] },
    ]);
    const gaps = classGaps(plan, mockSubgraph);
    const denyGap = gaps.find((g) => g.title.includes("Cancel order"));
    expect(denyGap).toBeDefined();
    expect(denyGap?.severity).toBe("MINOR");
  });
});
