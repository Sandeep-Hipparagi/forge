import type { CapabilityMap } from "@forge/core";
import { runAgentLoop, type AgentContext, type ToolResult } from "@forge/agent-harness";
import { assembleCapabilityMap } from "./cluster.js";
import { EXPLORER_CEILINGS, EXPLORER_SYSTEM, ExplorationDecision } from "./decision.js";
import {
  chooseBatchFallback,
  DEFAULT_FRONTIER_BUDGETS,
  runFrontier,
  type FrontierBudgets,
  type FrontierItem,
  type FrontierPorts,
  type FrontierRunInput,
} from "./frontier.js";

export type ChoiceSource = "deterministic" | "llm";

export type ExplorerInput = {
  sessionId: string;
  url: string;
  origin?: string;
  authenticated?: boolean;
  intent?: string;
  budgets?: Partial<FrontierBudgets>;
  /**
   * When true (or when FORGE_LLM_ENABLED=false), never call the model —
   * breadth-first value sort only (NFR-2 / EC-02).
   */
  forceDeterministic?: boolean;
};

/** Browser / I/O ports the orchestrator injects — chooseBatch is owned by explore(). */
export type ExplorerDriverPorts = Omit<FrontierPorts, "chooseBatch">;

export type ExploreResult = {
  map: CapabilityMap;
  choiceSource: ChoiceSource;
  modelCalls: number;
  exitReason: "EMITTED" | "MODEL_UNAVAILABLE" | "DETERMINISTIC" | "CALL_BUDGET";
};

function llmEnabled(forceDeterministic: boolean | undefined): boolean {
  if (forceDeterministic === true) return false;
  return (process.env["FORGE_LLM_ENABLED"] ?? "true") === "true";
}

function originOf(url: string): string {
  return new URL(url).origin;
}

function matchChosen(decision: ExplorationDecision, batch: FrontierItem[]): FrontierItem[] {
  const byKey = new Map<string, FrontierItem>();
  for (const item of batch) {
    byKey.set(`${item.fromStateId}|${item.ref}`, item);
  }
  const chosen: FrontierItem[] = [];
  const seen = new Set<string>();
  for (const entry of decision.exercise) {
    const key = `${entry.fromStateId}|${entry.ref}`;
    if (seen.has(key)) continue;
    const item = byKey.get(key);
    if (item === undefined) continue;
    seen.add(key);
    chosen.push(item);
  }
  return chosen;
}

/**
 * Build the chooseBatch port for call site 1.
 * LLM path: one short runAgentLoop turn emitting ExplorationDecision.
 * Fallback: top N by the §3.3 value sort (breadth-first); N from budgets.
 */
export function createChooseBatch(options: {
  context: AgentContext;
  forceDeterministic?: boolean;
  maxExercisePerBatch?: number;
  onSource: (source: ChoiceSource) => void;
  onModelCall: () => void;
}): FrontierPorts["chooseBatch"] {
  const useLlm = llmEnabled(options.forceDeterministic);
  const exerciseLimit = options.maxExercisePerBatch ?? DEFAULT_FRONTIER_BUDGETS.maxExercisePerBatch;

  return async (batch, states) => {
    if (batch.length === 0) return [];

    if (!useLlm) {
      options.onSource("deterministic");
      return chooseBatchFallback(batch, exerciseLimit);
    }

    options.onModelCall();
    const summary = {
      knownStates: [...states.values()].map((state) => ({
        id: state.id,
        signature: state.signature,
        url: state.url,
        title: state.title,
        affordanceCount: state.affordanceIds.length,
      })),
      batch: batch.map((item) => ({
        fromStateId: item.fromStateId,
        ref: item.ref,
        role: item.role,
        accessibleName: item.accessibleName,
        value: item.value,
      })),
    };

    const result = await runAgentLoop(
      {
        name: "explorer",
        system: EXPLORER_SYSTEM,
        seed: [
          {
            role: "user",
            content: `Choose the next affordances to exercise.\n${JSON.stringify(summary)}`,
          },
        ],
        tools: [],
        emit: { name: "emit_exploration_decision", schema: ExplorationDecision },
        ceilings: {
          toolCalls: 0,
          modelTurns: 1,
          wallClockMs: 10_000,
          maxTokens: EXPLORER_CEILINGS.maxTokens,
        },
      },
      options.context,
    );

    if (
      !result.ok ||
      result.output === null ||
      result.exitReason === "MODEL_UNAVAILABLE" ||
      result.exitReason === "SCHEMA_FAILED"
    ) {
      options.onSource("deterministic");
      return chooseBatchFallback(batch, exerciseLimit);
    }

    if (result.output.stop === true) {
      options.onSource("llm");
      return [];
    }

    const chosen = matchChosen(result.output, batch);
    if (chosen.length === 0) {
      options.onSource("deterministic");
      return chooseBatchFallback(batch, exerciseLimit);
    }

    options.onSource("llm");
    return chosen;
  };
}

/**
 * Explorer stage entry (06 §4.1): frontier crawl → cluster → CapabilityMap.
 * The model only chooses what to visit next; everything else is deterministic.
 */
export async function explore(
  input: ExplorerInput,
  context: AgentContext,
  driver: ExplorerDriverPorts,
): Promise<ToolResult<ExploreResult>> {
  const started = context.clock.monotonicMs();
  let choiceSource: ChoiceSource = "deterministic";
  let modelCalls = 0;
  let sawLlm = false;

  const chooseBatch = createChooseBatch({
    context,
    ...(input.forceDeterministic !== undefined
      ? { forceDeterministic: input.forceDeterministic }
      : {}),
    maxExercisePerBatch:
      input.budgets?.maxExercisePerBatch ?? DEFAULT_FRONTIER_BUDGETS.maxExercisePerBatch,
    onSource: (source) => {
      if (source === "llm") sawLlm = true;
      choiceSource = sawLlm ? "llm" : "deterministic";
    },
    onModelCall: () => {
      modelCalls += 1;
    },
  });

  const ports: FrontierPorts = { ...driver, chooseBatch };

  try {
    const frontierInput: FrontierRunInput = {
      sessionId: input.sessionId,
      origin: input.origin ?? originOf(input.url),
      authenticated: input.authenticated ?? false,
      budgets: {
        ...DEFAULT_FRONTIER_BUDGETS,
        ...input.budgets,
        maxModelCalls: input.budgets?.maxModelCalls ?? EXPLORER_CEILINGS.modelTurns,
        wallClockMs: input.budgets?.wallClockMs ?? EXPLORER_CEILINGS.wallClockMs,
      },
    };

    const graph = await runFrontier(ports, frontierInput);
    const map = assembleCapabilityMap({
      sessionId: input.sessionId,
      authenticated: input.authenticated ?? false,
      states: graph.states,
      affordances: graph.affordances,
      transitions: graph.transitions,
      frontier: graph.frontier,
      ids: driver.ids,
    });

    const exitReason: ExploreResult["exitReason"] = !llmEnabled(input.forceDeterministic)
      ? "DETERMINISTIC"
      : modelCalls === 0
        ? "DETERMINISTIC"
        : choiceSource === "deterministic"
          ? "MODEL_UNAVAILABLE"
          : graph.frontier.haltReason === "CALL_BUDGET"
            ? "CALL_BUDGET"
            : "EMITTED";

    return {
      ok: true,
      data: {
        map,
        choiceSource,
        modelCalls,
        exitReason,
      },
      evidenceIds: [],
      durationMs: Math.max(0, Math.round(context.clock.monotonicMs() - started)),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: error instanceof Error ? error.message : "Explorer failed",
      },
      evidenceIds: [],
      durationMs: Math.max(0, Math.round(context.clock.monotonicMs() - started)),
    };
  }
}
