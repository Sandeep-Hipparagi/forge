import { describe, expect, it } from "vitest";
import { isGrounded, type CapabilityMap } from "../schema/index.js";
import { ec03CheckoutSubgraph } from "../critic/ec03-fixture.js";
import { templatePlan } from "./template.js";

const ids = {
  next: (prefix: string) => `${prefix}_01j9tmpl01`,
};

describe("templatePlan", () => {
  it("derives a grounded plan from affordances alone (TG-5a)", () => {
    const sub = ec03CheckoutSubgraph();
    const { plan } = templatePlan(sub, ids, {
      lapId: "lap_01j9x2k9",
      capabilityId: "cap_01j9x2k8",
      round: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const map: CapabilityMap = {
      sessionId: "ses_01j9x2k4",
      authenticated: false,
      states: sub.states.map((s) => ({
        id: s.id,
        sessionId: "ses_01j9x2k4",
        signature: s.signature,
        url: s.url,
        title: s.title,
        authRequired: false,
        snapshotEvidenceId: "ev_01j9x3ab",
        affordanceIds: sub.affordances.filter((a) => a.stateId === s.id).map((a) => a.id),
        visitedVariants: 1,
        discoveredAt: "2026-01-01T00:00:00.000Z",
      })),
      affordances: sub.affordances,
      transitions: sub.transitions,
      capabilities: [],
      apiHints: [],
      frontier: { discovered: 4, explored: 4, haltReason: "EXHAUSTED" },
    };

    expect(plan.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(isGrounded(plan, map)).toBe(true);
    expect(plan.scenarios.some((s) => s.class === "happy")).toBe(true);
    expect(plan.scenarios.some((s) => s.class === "negative")).toBe(true);
  });

  it("exists with FORGE_LLM_ENABLED=false (deterministic source path)", () => {
    process.env["FORGE_LLM_ENABLED"] = "false";
    const sub = ec03CheckoutSubgraph();
    const { plan } = templatePlan(sub, ids, {
      lapId: "lap_01j9x2k9",
      capabilityId: "cap_01j9x2k8",
      round: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(plan.scenarios.length).toBeGreaterThan(0);
  });
});
