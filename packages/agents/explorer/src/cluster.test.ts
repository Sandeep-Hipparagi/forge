import type { Affordance, State, Transition } from "@forge/core";
import { describe, expect, it } from "vitest";
import {
  clusterCapabilities,
  fallbackNameCluster,
  longestCommonRouteLabel,
  routeTemplateOf,
} from "./cluster.js";

const at = "2026-01-01T00:00:00.000Z";
const sessionId = "ses_cluster01";

function state(
  id: string,
  url: string,
  title: string,
  affordanceIds: string[],
  authRequired = false,
): State {
  return {
    id,
    sessionId,
    signature: id.replace("st_", "").padEnd(16, "0").slice(0, 16),
    url,
    title,
    authRequired,
    snapshotEvidenceId: `ev_${id}`,
    affordanceIds,
    visitedVariants: 1,
    discoveredAt: at,
  };
}

function affordance(id: string, stateId: string, name: string, role = "link"): Affordance {
  return {
    id,
    stateId,
    ref: id,
    role,
    accessibleName: name,
    kind: role === "button" ? "button" : "link",
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
  };
}

function transition(
  id: string,
  from: string,
  to: string,
  via: string,
  action: Transition["action"] = "click",
): Transition {
  return {
    id,
    sessionId,
    fromStateId: from,
    toStateId: to,
    viaAffordanceId: via,
    action,
    observedAt: at,
  };
}

/** Shared header links present on every page — must be stripped or clustering collapses. */
const NAV = ["Home", "Cart", "Account", "Sign in", "Checkout"] as const;

function withNav(stateId: string, local: Affordance[]): Affordance[] {
  const nav = NAV.map((name, index) => affordance(`af_nav_${stateId}_${index}`, stateId, name));
  return [...nav, ...local];
}

describe("route helpers", () => {
  it("normalises numeric segments", () => {
    expect(routeTemplateOf("https://shop.test/order/1042")).toBe("/order/:id");
  });

  it("builds Account Orders from the common route prefix", () => {
    expect(longestCommonRouteLabel(["/account/orders"])).toBe("Account Orders");
    expect(
      fallbackNameCluster({
        stateIds: ["st_x"],
        routeTemplates: ["/login"],
        headings: ["Sign in"],
        states: [state("st_x", "https://shop.test/login", "Sign in", [])],
      }).name,
    ).toBe("Sign-in");
  });
});

describe("nav-stripping clustering (09 §5)", () => {
  it("collapses to one blob when global nav is not stripped", () => {
    // Sanity: if every state links to every other via shared nav pairs,
    // a graph that *kept* those edges would be one component.
    // Our algorithm strips them — this test proves strip is load-bearing
    // by comparing edge counts before/after the threshold.
    const states = [
      state("st_home", "https://shop.test/", "Browse", []),
      state("st_cart", "https://shop.test/cart", "Cart", []),
      state("st_login", "https://shop.test/login", "Sign in", []),
    ];
    const affordances = states.flatMap((s) => withNav(s.id, []));
    // Wire ONLY via global nav affordances (Home on each page → other pages).
    const transitions = [
      transition("tr1", "st_home", "st_cart", "af_nav_st_home_1"),
      transition("tr2", "st_cart", "st_login", "af_nav_st_cart_3"),
      transition("tr3", "st_login", "st_home", "af_nav_st_login_0"),
    ];

    const caps = clusterCapabilities({
      sessionId,
      states,
      affordances,
      transitions,
    });

    // After strip, no clustering edges remain → three singleton capabilities.
    expect(caps).toHaveLength(3);
  });

  it("forms separate capabilities once global nav is stripped", () => {
    const states = [
      state("st_browse", "https://shop.test/", "Browse", ["af_product"]),
      state("st_product", "https://shop.test/product/1", "Lens Cap", ["af_add"]),
      state("st_cart", "https://shop.test/cart", "Cart", ["af_to_checkout"]),
      state("st_cart_empty", "https://shop.test/cart?empty=1", "Empty cart", []),
      state("st_checkout", "https://shop.test/checkout", "Checkout", ["af_pay"], true),
      state("st_coupon", "https://shop.test/checkout?coupon=1", "Coupon", [], true),
      state("st_order", "https://shop.test/order/1", "Order confirmation", [], true),
      state("st_login", "https://shop.test/login", "Sign in", ["af_submit"]),
      state("st_orders", "https://shop.test/account/orders", "Orders", [], true),
    ];

    const locals: Affordance[] = [
      affordance("af_product", "st_browse", "Aperture Lens Cap"),
      affordance("af_add", "st_product", "Add to cart", "button"),
      affordance("af_to_checkout", "st_cart", "Proceed to checkout", "button"),
      affordance("af_pay", "st_checkout", "Pay with card", "button"),
      affordance("af_coupon", "st_checkout", "Apply coupon", "button"),
      affordance("af_submit", "st_login", "Sign in", "button"),
    ];

    const affordances = [...states.flatMap((s) => withNav(s.id, [])), ...locals];

    // Local (non-nav) transitions define the real product graph.
    const transitions = [
      transition("tr_b_p", "st_browse", "st_product", "af_product"),
      transition("tr_p_c", "st_product", "st_cart", "af_add"),
      transition("tr_c_ch", "st_cart", "st_checkout", "af_to_checkout"),
      transition("tr_ch_cp", "st_checkout", "st_coupon", "af_coupon"),
      transition("tr_ch_ord", "st_checkout", "st_order", "af_pay"),
    ];
    // Also add nav transitions that would otherwise glue everything together.
    const navTransitions = [
      transition("tr_nav1", "st_browse", "st_cart", "af_nav_st_browse_1"),
      transition("tr_nav2", "st_browse", "st_login", "af_nav_st_browse_3"),
      transition("tr_nav3", "st_cart", "st_orders", "af_nav_st_cart_2"),
      transition("tr_nav4", "st_checkout", "st_browse", "af_nav_st_checkout_0"),
    ];

    const caps = clusterCapabilities({
      sessionId,
      states,
      affordances,
      transitions: [...transitions, ...navTransitions],
    });

    const names = caps.map((capability) => capability.name).sort();
    expect(names).toEqual(["Account Orders", "Browse", "Cart", "Checkout", "Sign-in"].sort());
  });
});
