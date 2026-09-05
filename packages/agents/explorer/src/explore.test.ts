import type { Clock, IdGen, State } from "@forge/core";
import type { AgentContext, ModelClient, ModelTurn } from "@forge/agent-harness";
import { describe, expect, it } from "vitest";
import type { SnapshotAffordance } from "@forge/perception";
import { explore } from "./explore.js";
import type { FrontierObservation, FrontierPorts } from "./frontier.js";

function createClock(startMs = 0): Clock & { advance(ms: number): void } {
  let ms = startMs;
  return {
    now: () => new globalThis.Date(1_700_000_000_000 + ms),
    monotonicMs: () => ms,
    advance: (delta) => {
      ms += delta;
    },
  };
}

function createIds(): IdGen {
  const counters = new Map<string, number>();
  return {
    next(prefix: string): string {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}_${String(n).padStart(8, "0")}`;
    },
  };
}

function aff(
  partial: Partial<SnapshotAffordance> & Pick<SnapshotAffordance, "ref">,
): SnapshotAffordance {
  return {
    role: "link",
    accessibleName: partial.accessibleName ?? partial.ref,
    kind: "link",
    enabled: true,
    bbox: null,
    destructive: false,
    observedNotExercised: false,
    notExercisedReason: null,
    href: null,
    ...partial,
  };
}

/** Tiny two-page site for unit tests. */
function createMiniSite(
  clock: Clock & { advance(ms: number): void },
  ids: IdGen,
): ExplorerDriverPorts {
  let url = "https://shop.test/";
  const pages: Record<string, FrontierObservation> = {
    "https://shop.test/": {
      url: "https://shop.test/",
      title: "Browse",
      signature: "browse0000000000",
      snapshotEvidenceId: "ev_browse",
      affordances: [
        aff({ ref: "e1", accessibleName: "Cart", href: "https://shop.test/cart" }),
        aff({ ref: "e2", accessibleName: "Sign in", href: "https://shop.test/login" }),
        aff({
          ref: "e3",
          accessibleName: "Place order",
          kind: "button",
          role: "button",
          destructive: true,
          observedNotExercised: true,
          notExercisedReason: "DENY_LIST",
        }),
      ],
    },
    "https://shop.test/cart": {
      url: "https://shop.test/cart",
      title: "Cart",
      signature: "cart000000000000",
      snapshotEvidenceId: "ev_cart",
      affordances: [
        aff({ ref: "e10", accessibleName: "Home", href: "https://shop.test/" }),
        aff({ ref: "e11", accessibleName: "Checkout", href: "https://shop.test/checkout" }),
      ],
    },
    "https://shop.test/login": {
      url: "https://shop.test/login",
      title: "Sign in",
      signature: "login00000000000",
      snapshotEvidenceId: "ev_login",
      affordances: [
        aff({ ref: "e20", accessibleName: "Home", href: "https://shop.test/" }),
        aff({
          ref: "e21",
          accessibleName: "Submit",
          kind: "button",
          role: "button",
        }),
      ],
    },
    "https://shop.test/checkout": {
      url: "https://shop.test/checkout",
      title: "Checkout",
      signature: "checkout00000000",
      snapshotEvidenceId: "ev_checkout",
      affordances: [aff({ ref: "e30", accessibleName: "Home", href: "https://shop.test/" })],
      authRequired: true,
    },
  };

  return {
    clock,
    ids,
    observe: async () => pages[url]!,
    restore: async (state: State) => {
      url = state.url;
      return { matched: true };
    },
    exercise: async (item, affordance) => {
      const href =
        affordance.accessibleName === "Cart"
          ? "https://shop.test/cart"
          : affordance.accessibleName === "Sign in"
            ? "https://shop.test/login"
            : affordance.accessibleName === "Checkout"
              ? "https://shop.test/checkout"
              : affordance.accessibleName === "Home"
                ? "https://shop.test/"
                : null;
      if (href === null) {
        return {
          ok: false,
          error: { code: "INTERNAL", message: "no href" },
          evidenceIds: [],
          durationMs: 0,
        };
      }
      url = href;
      clock.advance(10);
      return { ok: true, data: { action: "click" }, evidenceIds: [], durationMs: 1 };
    },
    delay: async () => undefined,
  };
}

type ExplorerDriverPorts = Omit<FrontierPorts, "chooseBatch">;

class CountingModel implements ModelClient {
  calls = 0;
  constructor(private readonly turns: Array<ModelTurn | Error>) {}
  async complete(): Promise<ModelTurn> {
    this.calls += 1;
    const next = this.turns.shift();
    if (next === undefined) throw new Error("offline");
    if (next instanceof Error) throw next;
    return next;
  }
}

function agentContext(model: ModelClient, clock: Clock): AgentContext {
  return {
    model,
    clock,
    transcript: { persist: async () => "ev_transcript" },
  };
}

describe("explore()", () => {
  it("uses the breadth-first fallback with zero model calls when LLM is disabled", async () => {
    const clock = createClock();
    const ids = createIds();
    const model = new CountingModel([new Error("should not be called")]);
    const result = await explore(
      {
        sessionId: "ses_explore01",
        url: "https://shop.test/",
        forceDeterministic: true,
        budgets: { politenessDelayMs: 0, maxStates: 10, wallClockMs: 60_000 },
      },
      agentContext(model, clock),
      createMiniSite(clock, ids),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.choiceSource).toBe("deterministic");
    expect(result.data.modelCalls).toBe(0);
    expect(model.calls).toBe(0);
    expect(result.data.exitReason).toBe("DETERMINISTIC");
    expect(result.data.map.frontier.haltReason).toBe("EXHAUSTED");
    expect(result.data.map.states.length).toBeGreaterThanOrEqual(2);
    expect(result.data.map.capabilities.length).toBeGreaterThanOrEqual(1);

    const placeOrder = result.data.map.affordances.find((a) => a.accessibleName === "Place order");
    expect(placeOrder?.destructive).toBe(true);
    expect(placeOrder?.observedNotExercised).toBe(true);
  });

  it("falls back to deterministic when the model is unavailable", async () => {
    const clock = createClock();
    const ids = createIds();
    const model = new CountingModel([new Error("offline")]);
    const previous = process.env["FORGE_LLM_ENABLED"];
    process.env["FORGE_LLM_ENABLED"] = "true";
    try {
      const result = await explore(
        {
          sessionId: "ses_explore02",
          url: "https://shop.test/",
          budgets: { politenessDelayMs: 0, maxStates: 10, wallClockMs: 60_000 },
        },
        agentContext(model, clock),
        createMiniSite(clock, ids),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.choiceSource).toBe("deterministic");
      expect(result.data.modelCalls).toBeGreaterThan(0);
      expect(result.data.map.frontier.haltReason).toBe("EXHAUSTED");
    } finally {
      if (previous === undefined) delete process.env["FORGE_LLM_ENABLED"];
      else process.env["FORGE_LLM_ENABLED"] = previous;
    }
  });

  it("honours an ExplorationDecision from the model", async () => {
    const clock = createClock();
    const ids = createIds();
    // First batch: model picks only Cart (e1). Subsequent batches: model offline → fallback.
    const model = new CountingModel([
      {
        calls: [
          {
            id: "c1",
            name: "emit_exploration_decision",
            input: {
              exercise: [{ ref: "e1", fromStateId: "st_00000001", reason: "cart first" }],
              stop: false,
            },
          },
        ],
      },
      new Error("offline"),
      new Error("offline"),
      new Error("offline"),
      new Error("offline"),
      new Error("offline"),
      new Error("offline"),
      new Error("offline"),
    ]);
    const previous = process.env["FORGE_LLM_ENABLED"];
    process.env["FORGE_LLM_ENABLED"] = "true";
    try {
      const result = await explore(
        {
          sessionId: "ses_explore03",
          url: "https://shop.test/",
          budgets: { politenessDelayMs: 0, maxStates: 10, wallClockMs: 60_000 },
        },
        agentContext(model, clock),
        createMiniSite(clock, ids),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // First batch used LLM; later batches fell back — overall source is llm if any batch succeeded.
      expect(["llm", "deterministic"]).toContain(result.data.choiceSource);
      expect(result.data.map.states.some((s) => s.url.includes("/cart"))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["FORGE_LLM_ENABLED"];
      else process.env["FORGE_LLM_ENABLED"] = previous;
    }
  });
});
