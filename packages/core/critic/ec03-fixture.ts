import type { Affordance, Scenario, TestPlan, TestStep, Transition } from "../schema/index.js";
import type { CapabilitySubgraph } from "./types.js";

const SESSION = "ses_01j9x2k4";
const AT = "2026-01-01T00:00:00.000Z";

const STATE = {
  cart: "st_01j9x2k5",
  shipping: "st_01j9x2k6",
  payment: "st_01j9x2k7",
  confirm: "st_01j9x2k8",
} as const;

/** Checkout subgraph: 4 states, 12 transitions, 21 eligible + 2 deny-listed ([11 §3.4](docs/03-algorithms/11-coverage-critic.md)). */
export function ec03CheckoutSubgraph(): CapabilitySubgraph {
  const stateIds = [STATE.cart, STATE.shipping, STATE.payment, STATE.confirm] as const;
  const titles = ["Cart", "Shipping", "Payment", "Confirmation"] as const;
  const states = stateIds.map((id, i) => ({
    id,
    signature: `sig${i}`.padEnd(16, "0").slice(0, 16),
    url: `https://shop.test/checkout/${titles[i]!.toLowerCase()}`,
    title: titles[i]!,
  }));

  const affordances: Affordance[] = [];
  let refN = 1;
  const mk = (
    stateId: string,
    kind: Affordance["kind"],
    name: string,
    extra: Partial<Affordance> = {},
  ): Affordance => {
    const ref = `e${refN++}`;
    return {
      id: `af_${ref.padStart(8, "0")}`,
      stateId,
      ref,
      role: kind === "textbox" ? "textbox" : kind === "button" ? "button" : "link",
      accessibleName: name,
      kind,
      enabled: true,
      bbox: null,
      destructive: false,
      observedNotExercised: false,
      notExercisedReason: null,
      ...extra,
    };
  };

  for (const stateId of stateIds) {
    affordances.push(mk(stateId, "button", "Continue"));
    affordances.push(mk(stateId, "button", "Back"));
    affordances.push(mk(stateId, "textbox", "Field A"));
    affordances.push(mk(stateId, "textbox", "Field B"));
    affordances.push(mk(stateId, "link", "Help"));
  }
  affordances.push(mk(STATE.cart, "button", "Apply coupon"));
  affordances.push(
    mk(STATE.payment, "button", "Cancel order", {
      destructive: true,
      observedNotExercised: true,
      notExercisedReason: "deny-listed on non-disposable target",
    }),
  );
  affordances.push(
    mk(STATE.confirm, "button", "Delete account", {
      destructive: true,
      observedNotExercised: true,
      notExercisedReason: "deny-listed",
    }),
  );

  const byRef = (ref: string) => affordances.find((a) => a.ref === ref)!;
  const transitions: Transition[] = [];
  const edge = (from: string, to: string, ref: string, action: Transition["action"] = "click") => {
    const n = String(transitions.length + 1).padStart(8, "0");
    transitions.push({
      id: `tr_${n}`,
      sessionId: SESSION,
      fromStateId: from,
      toStateId: to,
      viaAffordanceId: byRef(ref).id,
      action,
      observedAt: AT,
    });
  };

  // refs: cart e1–e5 + e21; shipping e6–e10; payment e11–e15; confirm e16–e20
  edge(STATE.cart, STATE.shipping, "e1");
  edge(STATE.shipping, STATE.payment, "e6");
  edge(STATE.payment, STATE.confirm, "e11");
  edge(STATE.shipping, STATE.cart, "e7");
  edge(STATE.payment, STATE.shipping, "e12");
  edge(STATE.confirm, STATE.payment, "e17");
  edge(STATE.cart, STATE.cart, "e3", "fill");
  edge(STATE.shipping, STATE.shipping, "e8", "fill");
  edge(STATE.payment, STATE.payment, "e13", "fill");
  edge(STATE.cart, STATE.shipping, "e5");
  edge(STATE.shipping, STATE.payment, "e10");
  edge(STATE.payment, STATE.confirm, "e15");

  return {
    states,
    transitions,
    affordances,
    entryStateId: STATE.cart,
    exitConditions: ["Order confirmation reached", "Returns to Cart"],
  };
}

function step(
  id: string,
  order: number,
  kind: TestStep["kind"],
  stateId: string,
  affordanceRef: string | null,
  intent: string,
): TestStep {
  return {
    id,
    order,
    kind,
    targetIntent: intent,
    stateId,
    affordanceRef,
    locator: null,
    input: kind === "fill" ? "value" : null,
    timeoutMs: 5_000,
    optional: false,
    fingerprintId: null,
    resolvedCount: null,
  };
}

/**
 * Round-0 happy-path-only plan: 9 affordances · 5 transitions · 3 states · 4 assertions · C=1/4.
 */
export function ec03Round0Plan(): TestPlan {
  const planId = "pln_01j9x3a0";
  const { cart, shipping, payment } = STATE;

  const scenarios: Scenario[] = [
    {
      id: "SC-001",
      planId,
      title: "Guest checkout with a valid card",
      class: "happy",
      priority: "P0",
      priorityReason: "happy path",
      preconditions: ["Cart has one item"],
      steps: [
        step("s1", 0, "click", cart, "e1", "continue to shipping"),
        step("s2", 1, "fill", shipping, "e8", "enter shipping name"),
        step("s3", 2, "click", shipping, "e6", "continue to payment"),
        step("s4", 3, "fill", payment, "e13", "enter card number"),
        step("s5", 4, "assertVisible", payment, "e13", "card field remains"),
      ],
      expectedOutcome: "Payment form accepts the card",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
    },
    {
      id: "SC-002",
      planId,
      title: "Checkout applies tax to the total",
      class: "happy",
      priority: "P1",
      priorityReason: "happy path",
      preconditions: [],
      steps: [
        step("s1", 0, "click", cart, "e5", "continue via help path"),
        step("s2", 1, "click", shipping, "e10", "continue to payment"),
        step("s3", 2, "assertText", payment, "e12", "tax line visible"),
      ],
      expectedOutcome: "Tax appears on the payment total",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
    },
    {
      id: "SC-003",
      planId,
      title: "Signed-in checkout reuses the saved address",
      class: "happy",
      priority: "P1",
      priorityReason: "happy path",
      preconditions: ["User signed in"],
      steps: [
        step("s1", 0, "fill", cart, "e3", "confirm address field"),
        step("s2", 1, "click", cart, "e1", "continue"),
        step("s3", 2, "click", shipping, "e7", "return to cart briefly"),
        step("s4", 3, "assertUrl", cart, "e1", "back on cart"),
        step("s5", 4, "assertCount", cart, "e3", "one address control"),
      ],
      expectedOutcome: "Saved address is pre-filled",
      source: "agent",
      sourceRefs: [],
      plannedNotGenerated: false,
      notGeneratedReason: null,
      version: 1,
    },
  ];

  return {
    id: planId,
    lapId: "lap_01j9x2k9",
    capabilityId: "cap_01j9x2k8",
    round: 0,
    scenarios,
    markdownPath: "plans/checkout-r0.md",
    createdAt: AT,
  };
}
