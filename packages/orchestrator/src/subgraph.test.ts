import { describe, expect, it } from "vitest";
import type { Capability, CapabilityMap } from "@forge/core";
import { capabilitySubgraph } from "./subgraph.js";

const map = {
  sessionId: "ses_01live001",
  authenticated: false,
  states: [
    {
      id: "st_01live001",
      sessionId: "ses_01live001",
      signature: "abcdefghijklmnop",
      url: "https://example.test/",
      title: "Home",
      authRequired: false,
      snapshotEvidenceId: "ev_01live001",
      affordanceIds: ["af_01live001"],
      visitedVariants: 1,
      discoveredAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  affordances: [
    {
      id: "af_01live001",
      stateId: "st_01live001",
      ref: "e1",
      role: "link",
      accessibleName: "Next",
      kind: "link",
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
} as CapabilityMap;

const capability = {
  id: "cap_01live001",
  sessionId: "ses_01live001",
  name: "Home",
  description: "Entry",
  entryStateId: "st_01live001",
  stateIds: ["st_01live001"],
  exitConditions: ["Stay on home"],
  dependsOn: [],
  risk: {
    score: 0.5,
    factors: {
      authProximity: 0,
      dataMutation: 0,
      moneyOrPii: 0,
      graphCentrality: 0,
      affordanceDensity: 1,
      statedIntent: 0,
    },
  },
  priorityRank: 0,
} as Capability;

describe("capabilitySubgraph", () => {
  it("slices states and affordances for one capability", () => {
    const sub = capabilitySubgraph(map, capability);
    expect(sub.entryStateId).toBe("st_01live001");
    expect(sub.states).toHaveLength(1);
    expect(sub.affordances).toHaveLength(1);
  });
});
