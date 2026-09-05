import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  runAgentLoop,
  type AgentContext,
  type AgentLoopSpec,
  type ModelClient,
  type ModelTurn,
} from "./loop.js";

const Output = z.object({
  value: z.string(),
  frontier: z.object({
    haltReason: z.enum(["EXHAUSTED", "STATE_BUDGET", "TIME_BUDGET", "CALL_BUDGET"]),
  }),
});
type Output = z.infer<typeof Output>;

class QueuedModel implements ModelClient {
  constructor(
    private readonly turns: Array<ModelTurn | Error>,
    private readonly onCall: () => void = () => undefined,
  ) {}

  async complete(): Promise<ModelTurn> {
    this.onCall();
    const next = this.turns.shift();
    if (next === undefined) throw new Error("No recorded model turn");
    if (next instanceof Error) throw next;
    return next;
  }
}

function emit(input: unknown): ModelTurn {
  return { calls: [{ id: "call-emit", name: "emit_map", input }] };
}

function spec(overrides: Partial<AgentLoopSpec<Output>["ceilings"]> = {}): AgentLoopSpec<Output> {
  return {
    name: "explorer",
    system: "Return a map.",
    seed: [],
    tools: [
      {
        name: "snapshot",
        execute: async () => ({
          ok: true,
          data: {},
          evidenceIds: [],
          durationMs: 1,
        }),
      },
    ],
    emit: { name: "emit_map", schema: Output },
    ceilings: {
      toolCalls: 10,
      modelTurns: 10,
      wallClockMs: 1_000,
      maxTokens: 1_000,
      ...overrides,
    },
    onForcedClose: (output, reason) => ({
      ...output,
      frontier: {
        haltReason:
          reason === "CEILING_TIME"
            ? "TIME_BUDGET"
            : reason === "CEILING_TOOL_CALLS" || reason === "CEILING_TURNS"
              ? "CALL_BUDGET"
              : output.frontier.haltReason,
      },
    }),
  };
}

function context(model: ModelClient, monotonicMs: () => number = () => 0): AgentContext {
  return {
    model,
    clock: {
      now: () => new globalThis.Date("2026-01-01T00:00:00.000Z"),
      monotonicMs,
    },
    transcript: {
      persist: async () => "ev_transcript0",
    },
  };
}

const validOutput: Output = {
  value: "partial map",
  frontier: { haltReason: "EXHAUSTED" },
};

describe("runAgentLoop exits", () => {
  it("returns EMITTED for a valid terminal tool call", async () => {
    const result = await runAgentLoop(spec(), context(new QueuedModel([emit(validOutput)])));
    expect(result).toMatchObject({ ok: true, exitReason: "EMITTED", output: validOutput });
    expect(result.usage.calls).toBe(1);
  });

  it.each([
    ["CEILING_TOOL_CALLS", { toolCalls: 0 }],
    ["CEILING_TURNS", { modelTurns: 0 }],
    ["CEILING_TIME", { wallClockMs: 0 }],
  ] as const)("returns %s when its forced close has no artefact", async (reason, limits) => {
    const result = await runAgentLoop(spec(limits), context(new QueuedModel([{ calls: [] }])));
    expect(result).toMatchObject({ ok: false, output: null, exitReason: reason });
  });

  it("returns FORCED_CLOSE with a validated partial artefact and halt reason", async () => {
    const result = await runAgentLoop(
      spec({ toolCalls: 0 }),
      context(new QueuedModel([emit(validOutput)])),
    );
    expect(result).toMatchObject({
      ok: true,
      exitReason: "FORCED_CLOSE",
      output: { frontier: { haltReason: "CALL_BUDGET" } },
    });
  });

  it("returns SCHEMA_FAILED after two invalid terminal calls", async () => {
    const result = await runAgentLoop(
      spec(),
      context(
        new QueuedModel([
          emit({ value: 42, frontier: { haltReason: "EXHAUSTED" } }),
          emit({ value: 42, frontier: { haltReason: "EXHAUSTED" } }),
        ]),
      ),
    );
    expect(result).toMatchObject({ ok: false, output: null, exitReason: "SCHEMA_FAILED" });
  });

  it("returns MODEL_UNAVAILABLE without leaking an exception", async () => {
    const result = await runAgentLoop(spec(), context(new QueuedModel([new Error("offline")])));
    expect(result).toMatchObject({
      ok: false,
      output: null,
      exitReason: "MODEL_UNAVAILABLE",
    });
  });

  it("forces close after one nudge when the model ends without a tool call", async () => {
    const result = await runAgentLoop(
      spec(),
      context(new QueuedModel([{ calls: [] }, { calls: [] }, emit(validOutput)])),
    );
    expect(result.exitReason).toBe("FORCED_CLOSE");
  });
});
