import type { CapabilityMap } from "@forge/core";
import { describe, expect, it } from "vitest";
import { applyRanking, rankCapabilities } from "./prioritise.js";

const at = "2026-01-01T00:00:00.000Z";

function fixtureMap(): CapabilityMap {
  return {
    sessionId: "ses_00000000",
    authenticated: false,
    states: [
      {
        id: "st_login",
        sessionId: "ses_00000000",
        signature: "1111111111111111",
        url: "https://shop.test/login",
        title: "Sign in",
        authRequired: false,
        snapshotEvidenceId: "ev_snap_login",
        affordanceIds: ["af_login_button"],
        visitedVariants: 1,
        discoveredAt: at,
      },
      {
        id: "st_browse",
        sessionId: "ses_00000000",
        signature: "2222222222222222",
        url: "https://shop.test/products",
        title: "Browse products",
        authRequired: false,
        snapshotEvidenceId: "ev_snap_browse",
        affordanceIds: ["af_browse_link"],
        visitedVariants: 1,
        discoveredAt: at,
      },
      {
        id: "st_cart",
        sessionId: "ses_00000000",
        signature: "3333333333333333",
        url: "https://shop.test/cart",
        title: "Cart",
        authRequired: false,
        snapshotEvidenceId: "ev_snap_cart",
        affordanceIds: ["af_cart_checkout"],
        visitedVariants: 1,
        discoveredAt: at,
      },
      {
        id: "st_checkout",
        sessionId: "ses_00000000",
        signature: "4444444444444444",
        url: "https://shop.test/checkout",
        title: "Checkout",
        authRequired: true,
        snapshotEvidenceId: "ev_snap_checkout",
        affordanceIds: ["af_checkout_pay"],
        visitedVariants: 1,
        discoveredAt: at,
      },
    ],
    affordances: [
      {
        id: "af_login_button",
        stateId: "st_login",
        ref: "e_login",
        role: "button",
        accessibleName: "Sign in",
        kind: "button",
        enabled: true,
        bbox: null,
        destructive: false,
        observedNotExercised: false,
        notExercisedReason: null,
      },
      {
        id: "af_browse_link",
        stateId: "st_browse",
        ref: "e_browse",
        role: "link",
        accessibleName: "View products",
        kind: "link",
        enabled: true,
        bbox: null,
        destructive: false,
        observedNotExercised: false,
        notExercisedReason: null,
      },
      {
        id: "af_cart_checkout",
        stateId: "st_cart",
        ref: "e_checkout",
        role: "button",
        accessibleName: "Checkout",
        kind: "button",
        enabled: true,
        bbox: null,
        destructive: false,
        observedNotExercised: false,
        notExercisedReason: null,
      },
      {
        id: "af_checkout_pay",
        stateId: "st_checkout",
        ref: "e_pay",
        role: "button",
        accessibleName: "Pay now",
        kind: "button",
        enabled: true,
        bbox: null,
        destructive: false,
        observedNotExercised: false,
        notExercisedReason: null,
      },
    ],
    transitions: [
      {
        id: "tr_login_to_browse",
        sessionId: "ses_00000000",
        fromStateId: "st_login",
        toStateId: "st_browse",
        viaAffordanceId: "af_login_button",
        action: "submit",
        observedAt: at,
      },
      {
        id: "tr_browse_to_cart",
        sessionId: "ses_00000000",
        fromStateId: "st_browse",
        toStateId: "st_cart",
        viaAffordanceId: "af_browse_link",
        action: "click",
        observedAt: at,
      },
      {
        id: "tr_cart_to_checkout",
        sessionId: "ses_00000000",
        fromStateId: "st_cart",
        toStateId: "st_checkout",
        viaAffordanceId: "af_cart_checkout",
        action: "click",
        observedAt: at,
      },
    ],
    capabilities: [
      {
        id: "cap_login",
        sessionId: "ses_00000000",
        name: "Sign-in",
        description: "Sign in with username and password",
        entryStateId: "st_login",
        stateIds: ["st_login"],
        exitConditions: ["User is signed in"],
        dependsOn: [],
        risk: {
          score: 0,
          factors: {
            moneyOrPii: 0,
            dataMutation: 0,
            authProximity: 0,
            graphCentrality: 0,
            affordanceDensity: 0,
            statedIntent: 0,
          },
        },
        priorityRank: 0,
      },
      {
        id: "cap_browse",
        sessionId: "ses_00000000",
        name: "Browse",
        description: "Browse products",
        entryStateId: "st_browse",
        stateIds: ["st_browse"],
        exitConditions: ["Cart reachable"],
        dependsOn: [],
        risk: {
          score: 0,
          factors: {
            moneyOrPii: 0,
            dataMutation: 0,
            authProximity: 0,
            graphCentrality: 0,
            affordanceDensity: 0,
            statedIntent: 0,
          },
        },
        priorityRank: 1,
      },
      {
        id: "cap_checkout",
        sessionId: "ses_00000000",
        name: "Checkout",
        description: "Pay for items in the cart",
        entryStateId: "st_cart",
        stateIds: ["st_cart", "st_checkout"],
        exitConditions: ["Order placed"],
        dependsOn: ["cap_login"],
        risk: {
          score: 0,
          factors: {
            moneyOrPii: 0,
            dataMutation: 0,
            authProximity: 0,
            graphCentrality: 0,
            affordanceDensity: 0,
            statedIntent: 0,
          },
        },
        priorityRank: 2,
      },
    ],
    apiHints: [
      {
        method: "POST",
        urlPattern: "/api/orders",
        seenInStateIds: ["st_checkout"],
      },
    ],
    frontier: { discovered: 4, explored: 4, haltReason: "EXHAUSTED" },
  };
}

describe("risk ranking", () => {
  it("orders capabilities by risk with deterministic ties (I-17)", () => {
    const map = fixtureMap();
    const runs = Array.from({ length: 5 }, () =>
      applyRanking(map).capabilities.map(({ id }) => id),
    );
    const uniqueOrders = new Set(runs.map((order) => JSON.stringify(order)));
    expect(uniqueOrders.size).toBe(1);
    expect(runs[0]).toEqual(["cap_checkout", "cap_browse", "cap_login"]);
  });

  it("promotes intent-matching capabilities without changing scores", () => {
    const map = fixtureMap();
    const withoutIntent = applyRanking(map);
    const withIntent = applyRanking(map, { intent: "focus on checkout and payments" });

    const scoreById = new Map(
      withoutIntent.capabilities.map((capability) => [capability.id, capability.risk.score]),
    );

    for (const capability of withIntent.capabilities) {
      expect(capability.risk.score).toBeCloseTo(scoreById.get(capability.id) ?? 0, 6);
    }

    expect(withIntent.capabilities[0]?.id).toBe("cap_checkout");
  });

  it("rankCapabilities returns priorityRank indexes matching order", () => {
    const map = fixtureMap();
    const ranked = rankCapabilities(map);
    expect(ranked.map(({ id }) => id)).toEqual(["cap_checkout", "cap_browse", "cap_login"]);
    expect(ranked.map(({ priorityRank }) => priorityRank)).toEqual([0, 1, 2]);
  });
});
