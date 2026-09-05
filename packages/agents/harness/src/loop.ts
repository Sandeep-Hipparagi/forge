import type Anthropic from "@anthropic-ai/sdk";
import type { Clock, Usage } from "@forge/core";
import { z } from "zod";

export type ToolErrorCode =
  | "LOCATOR_NOT_FOUND"
  | "LOCATOR_AMBIGUOUS"
  | "ASSERTION_FAILED"
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "TARGET_UNREACHABLE"
  | "ELEMENT_NOT_INTERACTABLE"
  | "ACTION_DENIED"
  | "OFF_ORIGIN"
  | "BUDGET_EXHAUSTED"
  | "SCRIPT_ERROR"
  | "INTERNAL";

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  detail?: Record<string, unknown>;
};

export type ToolResult<T> =
  | { ok: true; data: T; evidenceIds: string[]; durationMs: number }
  | { ok: false; error: ToolError; evidenceIds: string[]; durationMs: number };

export type RegisteredTool = {
  name: string;
  execute(input: unknown): Promise<ToolResult<unknown>>;
};

export type ModelToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ModelTurn = {
  calls: ModelToolCall[];
  usage?: Partial<Usage>;
};

export type ModelRequest = {
  system: string;
  seed: Anthropic.MessageParam[];
  messages: readonly unknown[];
  tools: readonly string[];
  emitTool: string;
  maxTokens: number;
  forceEmit: boolean;
};

export interface ModelClient {
  complete(request: ModelRequest): Promise<ModelTurn>;
}

export interface TranscriptSink {
  persist(entries: readonly unknown[]): Promise<string>;
}

export type CeilingReason = "CEILING_TOOL_CALLS" | "CEILING_TURNS" | "CEILING_TIME";

export type AgentLoopExitReason =
  "EMITTED" | CeilingReason | "FORCED_CLOSE" | "SCHEMA_FAILED" | "MODEL_UNAVAILABLE";

export type AgentLoopSpec<TOut> = {
  name: "explorer" | "planner";
  system: string;
  seed: Anthropic.MessageParam[];
  tools: RegisteredTool[];
  emit: { name: string; schema: z.ZodType<TOut> };
  ceilings: {
    toolCalls: number;
    modelTurns: number;
    wallClockMs: number;
    maxTokens: number;
  };
  onForcedClose?: (output: TOut, reason: CeilingReason | "MODEL_ENDED") => TOut;
};

export type AgentLoopResult<TOut> = {
  ok: boolean;
  output: TOut | null;
  exitReason: AgentLoopExitReason;
  transcriptEvidenceId: string;
  usage: Usage;
};

export type AgentContext = {
  model: ModelClient;
  clock: Clock;
  transcript: TranscriptSink;
};

const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  calls: 0,
  estimatedUsd: 0,
});

function addUsage(total: Usage, turn: Partial<Usage> | undefined): void {
  total.inputTokens += turn?.inputTokens ?? 0;
  total.outputTokens += turn?.outputTokens ?? 0;
  total.cacheReadTokens += turn?.cacheReadTokens ?? 0;
  total.calls += 1;
  total.estimatedUsd += turn?.estimatedUsd ?? 0;
}

function reachedCeiling<TOut>(
  spec: AgentLoopSpec<TOut>,
  turns: number,
  toolCalls: number,
  elapsedMs: number,
): CeilingReason | null {
  if (toolCalls >= spec.ceilings.toolCalls) return "CEILING_TOOL_CALLS";
  if (turns >= spec.ceilings.modelTurns) return "CEILING_TURNS";
  if (elapsedMs >= spec.ceilings.wallClockMs) return "CEILING_TIME";
  return null;
}

export async function runAgentLoop<TOut>(
  spec: AgentLoopSpec<TOut>,
  context: AgentContext,
): Promise<AgentLoopResult<TOut>> {
  const transcript: unknown[] = [];
  const messages: unknown[] = [...spec.seed];
  const usage = emptyUsage();
  const startedAt = context.clock.monotonicMs();
  let turns = 0;
  let toolCalls = 0;
  let validationFailures = 0;
  let nudged = false;

  const finish = async (
    ok: boolean,
    output: TOut | null,
    exitReason: AgentLoopExitReason,
  ): Promise<AgentLoopResult<TOut>> => ({
    ok,
    output,
    exitReason,
    transcriptEvidenceId: await context.transcript.persist(transcript),
    usage,
  });

  const request = async (forceEmit: boolean): Promise<ModelTurn | null> => {
    try {
      const turn = await context.model.complete({
        system: spec.system,
        seed: spec.seed,
        messages,
        tools: spec.tools.map(({ name }) => name),
        emitTool: spec.emit.name,
        maxTokens: spec.ceilings.maxTokens,
        forceEmit,
      });
      turns += 1;
      addUsage(usage, turn.usage);
      transcript.push({ direction: "model", turn });
      return turn;
    } catch (error) {
      transcript.push({
        direction: "model",
        error: error instanceof Error ? error.message : "Model unavailable",
      });
      return null;
    }
  };

  const forceClose = async (
    reason: CeilingReason | "MODEL_ENDED",
  ): Promise<AgentLoopResult<TOut>> => {
    const turn = await request(true);
    if (turn === null) return finish(false, null, "MODEL_UNAVAILABLE");
    const emitCall = turn.calls.find(({ name }) => name === spec.emit.name);
    if (emitCall === undefined) {
      return finish(false, null, reason === "MODEL_ENDED" ? "FORCED_CLOSE" : reason);
    }
    const parsed = spec.emit.schema.safeParse(emitCall.input);
    if (!parsed.success) {
      transcript.push({ direction: "validation", issues: parsed.error.issues });
      return finish(false, null, reason === "MODEL_ENDED" ? "FORCED_CLOSE" : reason);
    }
    const output = spec.onForcedClose?.(parsed.data, reason) ?? parsed.data;
    return finish(true, output, "FORCED_CLOSE");
  };

  for (;;) {
    const ceiling = reachedCeiling(spec, turns, toolCalls, context.clock.monotonicMs() - startedAt);
    if (ceiling !== null) return forceClose(ceiling);

    const turn = await request(false);
    if (turn === null) return finish(false, null, "MODEL_UNAVAILABLE");

    if (turn.calls.length === 0) {
      if (nudged) return forceClose("MODEL_ENDED");
      nudged = true;
      messages.push({ role: "user", content: `Call ${spec.emit.name} to finish.` });
      transcript.push({ direction: "harness", action: "NUDGE_EMIT" });
      continue;
    }

    for (const call of turn.calls) {
      if (call.name === spec.emit.name) {
        const parsed = spec.emit.schema.safeParse(call.input);
        if (parsed.success) return finish(true, parsed.data, "EMITTED");
        validationFailures += 1;
        transcript.push({ direction: "validation", issues: parsed.error.issues });
        if (validationFailures >= 2) return finish(false, null, "SCHEMA_FAILED");
        messages.push({
          role: "user",
          content: JSON.stringify({ tool: spec.emit.name, issues: parsed.error.issues }),
        });
        continue;
      }

      const tool = spec.tools.find(({ name }) => name === call.name);
      const result =
        tool === undefined
          ? {
              ok: false as const,
              error: { code: "INTERNAL" as const, message: `Unknown tool: ${call.name}` },
              evidenceIds: [],
              durationMs: 0,
            }
          : await tool.execute(call.input).catch((error: unknown) => ({
              ok: false as const,
              error: {
                code: "INTERNAL" as const,
                message: error instanceof Error ? error.message : "Tool failed",
              },
              evidenceIds: [],
              durationMs: 0,
            }));
      toolCalls += 1;
      transcript.push({ direction: "tool", callId: call.id, result });
      messages.push({ role: "user", content: JSON.stringify({ callId: call.id, result }) });
      const afterToolCeiling = reachedCeiling(
        spec,
        turns,
        toolCalls,
        context.clock.monotonicMs() - startedAt,
      );
      if (afterToolCeiling !== null) return forceClose(afterToolCeiling);
    }
  }
}
