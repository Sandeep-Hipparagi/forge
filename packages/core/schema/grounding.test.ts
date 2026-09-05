import { describe, expect, it } from "vitest";
import type { CapabilityMap, TestPlan } from "./index.js";
import { groundingIssues, isGrounded } from "./grounding.js";

const map: CapabilityMap = {
  sessionId: "ses_01j9x2k4",
  authenticated: false,
  states: [
    {
      id: "st_01j9x2k5",
      sessionId: "ses_01j9x2k4",
      signature: "0123456789abcdef",
      url: "https://shop.test/",
      title: "Shop",
      authRequired: false,
      snapshotEvidenceId: "ev_01j9x3ab",
      affordanceIds: ["af_01j9x2k6"],
      visitedVariants: 1,
      discoveredAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  affordances: [
    {
      id: "af_01j9x2k6",
      stateId: "st_01j9x2k5",
      ref: "e42",
      role: "button",
      accessibleName: "Continue",
      kind: "button",
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
    },
  ],
  transitions: [],
  capabilities: [],
  apiHints: [],
  frontier: { discovered: 1, explored: 1, haltReason: "EXHAUSTED" },
};

function plan(stateId = "st_01j9x2k5", affordanceRef: string | null = "e42"): TestPlan {
  return {
    id: "pln_01j9x3a0",
    lapId: "lap_01j9x2k9",
    capabilityId: "cap_01j9x2k8",
    round: 0,
    scenarios: [
      {
        id: "SC-001",
        planId: "pln_01j9x3a0",
        title: "Continue from the entry page",
        class: "happy",
        priority: "P0",
        priorityReason: "Primary flow",
        preconditions: [],
        steps: [
          {
            id: "s1",
            order: 0,
            kind: "click",
            targetIntent: "Continue the primary flow",
            stateId,
            affordanceRef,
            locator: null,
            input: null,
            timeoutMs: 5_000,
            optional: false,
            fingerprintId: null,
            resolvedCount: null,
          },
        ],
        expectedOutcome: "The next state is reached",
        source: "agent",
        sourceRefs: [],
        plannedNotGenerated: false,
        notGeneratedReason: null,
        version: 1,
      },
    ],
    markdownPath: "plans/entry.md",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("I-13 plan grounding", () => {
  it("accepts state and snapshot-ref pairs observed in the map", () => {
    expect(isGrounded(plan(), map)).toBe(true);
  });

  it("rejects an unknown state", () => {
    expect(groundingIssues(plan("st_unknown00"), map)).toEqual([
      expect.objectContaining({ code: "UNKNOWN_STATE", reference: "st_unknown00" }),
    ]);
  });

  it("rejects an affordance ref not observed in the cited state", () => {
    expect(groundingIssues(plan("st_01j9x2k5", "e99"), map)).toEqual([
      expect.objectContaining({ code: "UNKNOWN_AFFORDANCE", reference: "e99" }),
    ]);
  });
});
