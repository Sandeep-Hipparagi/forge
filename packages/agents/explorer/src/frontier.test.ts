import type { Clock, IdGen } from "@forge/core";
import { describe, expect, it } from "vitest";
import type { SnapshotAffordance } from "@forge/perception";
import {
  chooseBatchFallback,
  isOffOrigin,
  runFrontier,
  scoreAffordanceValue,
  type FrontierItem,
  type FrontierObservation,
  type FrontierPorts,
} from "./frontier.js";

function createClock(startMs = 0): Clock & { advance(ms: number): void; setMs(ms: number): void } {
  let ms = startMs;
  return {
    now: () => new globalThis.Date(1_700_000_000_000 + ms),
    monotonicMs: () => ms,
    advance: (delta) => {
      ms += delta;
    },
    setMs: (value) => {
      ms = value;
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
    ...partial,
  };
}

function observation(
  signature: string,
  url: string,
  affordances: SnapshotAffordance[],
  title = "Page",
): FrontierObservation {
  return {
    url,
    title,
    signature,
    snapshotEvidenceId: `ev_${signature}`,
    affordances,
  };
}

type ScriptedWorld = {
  ports: FrontierPorts;
  clock: ReturnType<typeof createClock>;
  delays: number[];
  setObservation(obs: FrontierObservation): void;
  link(fromSig: string, ref: string, to: FrontierObservation): void;
};

function scriptedWorld(seed: FrontierObservation): ScriptedWorld {
  const clock = createClock();
  const ids = createIds();
  let current = seed;
  const edges = new Map<string, FrontierObservation>();
  const delays: number[] = [];

  const ports: FrontierPorts = {
    clock,
    ids,
    observe: async () => current,
    restore: async () => ({ matched: true }),
    exercise: async (item) => {
      const next = edges.get(`${item.fromSignature}|${item.ref}`);
      if (!next) {
        return {
          ok: false,
          error: { code: "LOCATOR_NOT_FOUND", message: "no scripted edge" },
          evidenceIds: [],
          durationMs: 0,
        };
      }
      current = next;
      clock.advance(10);
      return { ok: true, data: { action: "click" }, evidenceIds: [], durationMs: 10 };
    },
    chooseBatch: async (batch) => chooseBatchFallback(batch),
    delay: async (ms) => {
      delays.push(ms);
      clock.advance(ms);
    },
  };

  return {
    ports,
    clock,
    delays,
    setObservation: (obs) => {
      current = obs;
    },
    link: (fromSig, ref, to) => {
      edges.set(`${fromSig}|${ref}`, to);
    },
  };
}

describe("frontier helpers", () => {
  it("scores navigational informative links above bare buttons", () => {
    const link = scoreAffordanceValue(
      { role: "link", kind: "link", accessibleName: "Products" },
      0,
      12,
    );
    const icon = scoreAffordanceValue(
      { role: "button", kind: "button", accessibleName: "★" },
      0,
      12,
    );
    expect(link).toBeGreaterThan(icon);
  });

  it("detects off-origin URLs (FR-109)", () => {
    expect(isOffOrigin("https://evil.test/x", "https://shop.test")).toBe(true);
    expect(isOffOrigin("https://shop.test/cart", "https://shop.test")).toBe(false);
  });

  it("chooseBatchFallback respects maxExercisePerBatch (default 6, thorough higher)", () => {
    const batch: FrontierItem[] = Array.from({ length: 12 }, (_, i) => ({
      fromSignature: "sig",
      fromStateId: "st_1",
      affordanceId: `af_${i}`,
      ref: `e${i}`,
      role: "link",
      accessibleName: `Link ${i}`,
      kind: "link",
      value: 1 - i * 0.01,
      restoreAttempts: 0,
    }));
    expect(chooseBatchFallback(batch)).toHaveLength(6);
    expect(chooseBatchFallback(batch, 60)).toHaveLength(12);
    expect(chooseBatchFallback(batch, 3)).toHaveLength(3);
  });
});

describe("frontier halt reasons (FR-107)", () => {
  it("halts with EXHAUSTED when the frontier empties inside budget", async () => {
    const entry = observation("aaaaaaaaaaaaaaaa", "https://shop.test/", [
      aff({ ref: "e1", accessibleName: "Go", href: "/a" }),
    ]);
    const leaf = observation("bbbbbbbbbbbbbbbb", "https://shop.test/a", []);
    const world = scriptedWorld(entry);
    world.link("aaaaaaaaaaaaaaaa", "e1", leaf);

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000001",
      origin: "https://shop.test",
      budgets: { maxStates: 10, wallClockMs: 60_000, maxModelCalls: 8, politenessDelayMs: 0 },
    });

    expect(result.frontier.haltReason).toBe("EXHAUSTED");
    expect(result.states).toHaveLength(2);
    expect(result.transitions).toHaveLength(1);
  });

  it("halts with STATE_BUDGET when the state ceiling binds first", async () => {
    const pages: FrontierObservation[] = [];
    for (let i = 0; i < 5; i += 1) {
      const sig = `s${String(i).padStart(15, "0")}`;
      pages.push(
        observation(sig, `https://shop.test/p/${i}`, [
          aff({ ref: "next", accessibleName: "Next", href: `/p/${i + 1}` }),
        ]),
      );
    }
    const world = scriptedWorld(pages[0]!);
    for (let i = 0; i < pages.length - 1; i += 1) {
      world.link(pages[i]!.signature, "next", pages[i + 1]!);
    }

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000002",
      origin: "https://shop.test",
      budgets: {
        maxStates: 3,
        wallClockMs: 60_000,
        maxModelCalls: 20,
        politenessDelayMs: 0,
        frontierBatchSize: 10,
      },
    });

    expect(result.frontier.haltReason).toBe("STATE_BUDGET");
    expect(result.states.length).toBeLessThanOrEqual(3);
    expect(result.states.length).toBeGreaterThan(0);
  });

  it("halts with TIME_BUDGET when the wall clock binds first", async () => {
    const entry = observation("cccccccccccccccc", "https://shop.test/", [
      aff({ ref: "e1", accessibleName: "One", href: "/1" }),
      aff({ ref: "e2", accessibleName: "Two", href: "/2" }),
    ]);
    const a = observation("dddddddddddddddd", "https://shop.test/1", [
      aff({ ref: "e3", accessibleName: "Three", href: "/3" }),
    ]);
    const b = observation("eeeeeeeeeeeeeeee", "https://shop.test/2", []);
    const c = observation("ffffffffffffffff", "https://shop.test/3", []);
    const world = scriptedWorld(entry);
    world.link("cccccccccccccccc", "e1", a);
    world.link("cccccccccccccccc", "e2", b);
    world.link("dddddddddddddddd", "e3", c);

    // Advance the clock past the budget during the first chooseBatch.
    world.ports.chooseBatch = async (batch) => {
      world.clock.advance(5_000);
      return chooseBatchFallback(batch);
    };

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000003",
      origin: "https://shop.test",
      budgets: {
        maxStates: 40,
        wallClockMs: 1_000,
        maxModelCalls: 20,
        politenessDelayMs: 0,
      },
    });

    expect(result.frontier.haltReason).toBe("TIME_BUDGET");
  });

  it("halts with CALL_BUDGET when model-call ceiling binds first", async () => {
    const entry = observation("1111111111111111", "https://shop.test/", [
      aff({ ref: "e1", accessibleName: "A", href: "/a" }),
      aff({ ref: "e2", accessibleName: "B", href: "/b" }),
      aff({ ref: "e3", accessibleName: "C", href: "/c" }),
    ]);
    const world = scriptedWorld(entry);
    world.link(
      "1111111111111111",
      "e1",
      observation("2222222222222222", "https://shop.test/a", [
        aff({ ref: "e4", accessibleName: "D", href: "/d" }),
      ]),
    );
    world.link(
      "1111111111111111",
      "e2",
      observation("3333333333333333", "https://shop.test/b", [
        aff({ ref: "e5", accessibleName: "E", href: "/e" }),
      ]),
    );
    world.link(
      "1111111111111111",
      "e3",
      observation("4444444444444444", "https://shop.test/c", [
        aff({ ref: "e6", accessibleName: "F", href: "/f" }),
      ]),
    );

    // Only take one item per batch so leftover work remains after the call ceiling.
    world.ports.chooseBatch = async (batch) => sortOne(batch);

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000004",
      origin: "https://shop.test",
      budgets: {
        maxStates: 40,
        wallClockMs: 60_000,
        maxModelCalls: 1,
        politenessDelayMs: 0,
        frontierBatchSize: 40,
      },
    });

    expect(result.frontier.haltReason).toBe("CALL_BUDGET");
    expect(result.states.length).toBeGreaterThan(1);
  });

  it("records OFF_ORIGIN and never exercises off-origin links", async () => {
    const entry = observation("aaaaaaaaaaaaaaaa", "https://shop.test/", [
      aff({ ref: "ext", accessibleName: "Partner", href: "https://evil.test/x" }),
      aff({ ref: "ok", accessibleName: "Cart", href: "/cart" }),
    ]);
    const cart = observation("bbbbbbbbbbbbbbbb", "https://shop.test/cart", []);
    const world = scriptedWorld(entry);
    world.link("aaaaaaaaaaaaaaaa", "ok", cart);

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000005",
      origin: "https://shop.test",
      budgets: { politenessDelayMs: 0 },
    });

    const off = result.affordances.find((a) => a.ref === "ext");
    expect(off?.observedNotExercised).toBe(true);
    expect(off?.notExercisedReason).toBe("OFF_ORIGIN");
    expect(result.frontier.haltReason).toBe("EXHAUSTED");
    expect(result.states.map((s) => s.url)).toEqual([
      "https://shop.test/",
      "https://shop.test/cart",
    ]);
  });

  it("enforces politeness delays between exercises", async () => {
    const entry = observation("aaaaaaaaaaaaaaaa", "https://shop.test/", [
      aff({ ref: "e1", accessibleName: "One", href: "/1" }),
      aff({ ref: "e2", accessibleName: "Two", href: "/2" }),
    ]);
    const one = observation("bbbbbbbbbbbbbbbb", "https://shop.test/1", []);
    const two = observation("cccccccccccccccc", "https://shop.test/2", []);
    const world = scriptedWorld(entry);
    world.link("aaaaaaaaaaaaaaaa", "e1", one);
    world.link("aaaaaaaaaaaaaaaa", "e2", two);

    await runFrontier(world.ports, {
      sessionId: "ses_00000006",
      origin: "https://shop.test",
      budgets: { politenessDelayMs: 250, maxModelCalls: 4 },
    });

    expect(world.delays.some((ms) => ms > 0)).toBe(true);
  });

  it("widens politeness delay after a 429 without abandoning the frontier", async () => {
    const entry = observation("aaaaaaaaaaaaaaaa", "https://shop.test/", [
      aff({ ref: "e1", accessibleName: "One", href: "/1" }),
      aff({ ref: "e2", accessibleName: "Two", href: "/2" }),
    ]);
    const one = observation("bbbbbbbbbbbbbbbb", "https://shop.test/1", []);
    const two = observation("cccccccccccccccc", "https://shop.test/2", []);
    const world = scriptedWorld(entry);
    world.link("aaaaaaaaaaaaaaaa", "e1", one);
    world.link("aaaaaaaaaaaaaaaa", "e2", two);

    let calls = 0;
    const baseExercise = world.ports.exercise;
    world.ports.exercise = async (item, affordance) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          error: {
            code: "TARGET_UNREACHABLE",
            message: "rate limited",
            detail: { status: 429 },
          },
          evidenceIds: [],
          durationMs: 0,
        };
      }
      return baseExercise(item, affordance);
    };

    const result = await runFrontier(world.ports, {
      sessionId: "ses_00000007",
      origin: "https://shop.test",
      budgets: { politenessDelayMs: 100, maxModelCalls: 4 },
    });

    expect(result.frontier.haltReason).toBe("EXHAUSTED");
    expect(world.delays.some((ms) => ms >= 200)).toBe(true);
  });
});

function sortOne(batch: FrontierItem[]): FrontierItem[] {
  return chooseBatchFallback(batch).slice(0, 1);
}
