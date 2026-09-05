import type { Affordance, CapabilityMap, State, Transition } from "@forge/core";
import { describe, expect, it } from "vitest";
import { assembleCapabilityMap } from "@forge/agent-explorer";
import { applyRanking } from "./prioritise.js";

const at = "2026-01-01T00:00:00.000Z";
const sessionId = "ses_ec01map";

function state(
  id: string,
  url: string,
  title: string,
  affordanceIds: string[],
  authRequired = false,
): State {
  const sig = id.replace(/^st_/, "").padEnd(16, "a").slice(0, 16);
  return {
    id,
    sessionId,
    signature: sig,
    url,
    title,
    authRequired,
    snapshotEvidenceId: `ev_${id}`,
    affordanceIds,
    visitedVariants: 1,
    discoveredAt: at,
  };
}

function aff(
  id: string,
  stateId: string,
  name: string,
  kind: Affordance["kind"] = "link",
): Affordance {
  return {
    id,
    stateId,
    ref: id,
    role: kind === "textbox" ? "textbox" : kind === "button" ? "button" : "link",
    accessibleName: name,
    kind,
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
  };
}

function tr(
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

const NAV = ["Home", "Cart", "Account", "Sign in", "Checkout"] as const;

function navAffordances(stateId: string): Affordance[] {
  return NAV.map((name, index) => aff(`af_nav_${stateId}_${index}`, stateId, name));
}

/**
 * Aperture-shaped map (19 §2.4): five capabilities after nav-stripping
 * clustering, ranked Checkout · Sign-in · Account Orders · Cart · Browse.
 */
function apertureExplorationGraph(): Omit<CapabilityMap, "capabilities"> {
  const states: State[] = [
    state("st_browse", "https://aperture.test/", "Browse", []),
    state("st_product", "https://aperture.test/product/APT-LC-01", "Lens Cap", []),
    state("st_cart", "https://aperture.test/cart", "Cart", []),
    state("st_cart_empty", "https://aperture.test/cart?empty=1", "Empty cart", []),
    state("st_checkout", "https://aperture.test/checkout", "Checkout", [], true),
    state("st_coupon_ok", "https://aperture.test/checkout?coupon=ok", "Coupon applied", [], true),
    state("st_coupon_err", "https://aperture.test/checkout?coupon=bad", "Coupon error", [], true),
    state("st_order", "https://aperture.test/order/1001", "Order confirmation", [], true),
    state("st_login", "https://aperture.test/login", "Sign in", []),
    state("st_login_err", "https://aperture.test/login?error=1", "Sign in", []),
    state("st_orders", "https://aperture.test/account/orders", "Your orders", [], true),
  ];

  const locals: Affordance[] = [
    // Browse — densest surface
    aff("af_p1", "st_browse", "Aperture Lens Cap"),
    aff("af_p2", "st_browse", "Aperture Strap"),
    aff("af_p3", "st_browse", "Aperture Cloth"),
    aff("af_p4", "st_browse", "Aperture Hood"),
    aff("af_p5", "st_browse", "Aperture Filter"),
    aff("af_p6", "st_browse", "Search products"),
    aff("af_add", "st_product", "Add to cart", "button"),
    // Cart — mutation without money capture
    aff("af_checkout_btn", "st_cart", "Proceed to checkout", "button"),
    aff("af_remove", "st_cart", "Update cart", "button"),
    aff("af_qty_cart", "st_cart", "Quantity", "textbox"),
    // Checkout — money + mutation
    aff("af_coupon", "st_checkout", "Apply coupon", "button"),
    aff("af_card", "st_checkout", "Card number", "textbox"),
    aff("af_pay", "st_checkout", "Pay now", "button"),
    aff("af_email", "st_checkout", "Billing email", "textbox"),
    // Sign-in
    aff("af_user", "st_login", "Email", "textbox"),
    aff("af_pass", "st_login", "Password", "textbox"),
    aff("af_signin", "st_login", "Sign in", "button"),
    // Account orders — PII-adjacent
    aff("af_addr", "st_orders", "Shipping address"),
    aff("af_phone", "st_orders", "Phone"),
  ];

  const affordances: Affordance[] = [...states.flatMap((s) => navAffordances(s.id)), ...locals];

  for (const s of states) {
    s.affordanceIds = affordances.filter((a) => a.stateId === s.id).map((a) => a.id);
  }

  const transitions: Transition[] = [
    // Local browse graph
    tr("tr_b_p", "st_browse", "st_product", "af_p1"),
    tr("tr_p_c", "st_product", "st_cart", "af_add"),
    // Cart local
    tr("tr_c_empty", "st_cart", "st_cart_empty", "af_remove", "submit"),
    tr("tr_c_ch", "st_cart", "st_checkout", "af_checkout_btn"), // Checkout local (submit = mutation)
    tr("tr_ch_ok", "st_checkout", "st_coupon_ok", "af_coupon"),
    tr("tr_ch_err", "st_checkout", "st_coupon_err", "af_coupon"),
    tr("tr_ch_ord", "st_checkout", "st_order", "af_pay", "submit"),
    // Sign-in local
    tr("tr_li_err", "st_login", "st_login_err", "af_signin", "submit"),
    // Cross-capability edges that ranking uses for centrality (kept; not all nav)
    tr("tr_b_login", "st_browse", "st_login", "af_nav_st_browse_3"),
    tr("tr_login_b", "st_login", "st_browse", "af_nav_st_login_0"),
    tr("tr_b_cart", "st_browse", "st_cart", "af_nav_st_browse_1"),
    tr("tr_b_orders", "st_browse", "st_orders", "af_nav_st_browse_2"),
    tr("tr_cart_b", "st_cart", "st_browse", "af_nav_st_cart_0"),
    tr("tr_ch_b", "st_checkout", "st_browse", "af_nav_st_checkout_0"),
    tr("tr_ord_b", "st_orders", "st_browse", "af_nav_st_orders_0"),
    // Auth boundary into checkout
    tr("tr_login_ch", "st_login", "st_checkout", "af_nav_st_login_4"),
  ];

  return {
    sessionId,
    authenticated: true,
    states,
    affordances,
    transitions,
    apiHints: [
      {
        method: "POST",
        urlPattern: "/api/orders",
        seenInStateIds: ["st_checkout", "st_order"],
      },
    ],
    frontier: { discovered: states.length, explored: transitions.length, haltReason: "EXHAUSTED" },
  };
}

describe("EC-01 backlog order (cluster + rank)", () => {
  it("orders Checkout · Sign-in · Account Orders · Cart · Browse", () => {
    const graph = apertureExplorationGraph();
    const clustered = assembleCapabilityMap({
      sessionId: graph.sessionId,
      authenticated: graph.authenticated,
      states: graph.states,
      affordances: graph.affordances,
      transitions: graph.transitions,
      frontier: graph.frontier,
    });

    const names = clustered.capabilities.map((capability) => capability.name);
    expect(names).toEqual(
      expect.arrayContaining(["Checkout", "Sign-in", "Account Orders", "Cart", "Browse"]),
    );
    expect(clustered.capabilities.length).toBe(5);

    const ranked = applyRanking({
      ...clustered,
      apiHints: graph.apiHints,
    });

    expect(ranked.capabilities.map((capability) => capability.name)).toEqual([
      "Checkout",
      "Sign-in",
      "Account Orders",
      "Cart",
      "Browse",
    ]);
  });
});
