import type { CapabilityMap, RunContext, Session } from "@forge/core";
import {
  explore,
  type ChoiceSource,
  type ExplorerDriverPorts,
  type ExploreResult,
} from "@forge/agent-explorer";
import type { AgentContext, ModelClient } from "@forge/agent-harness";
import type { ForgeStore } from "@forge/store";
import type { Credentials } from "@forge/runner";
import { applyRanking } from "./prioritise.js";
import { authenticateSession } from "./authenticate.js";
import { openLiveExploreDriver } from "./live-ports.js";

export type ExploreSessionInput = {
  url: string;
  username?: string;
  password?: string;
  intent?: string;
  forceDeterministic?: boolean;
  /** Injected ports for replay / unit tests — skips live browser. */
  driver?: ExplorerDriverPorts;
  model?: ModelClient;
  headless?: boolean;
  /** When false, leave the session in PRIORITISING (full pipeline). Default true for forge explore. */
  terminal?: boolean;
  /** Persist observe screenshots when using the live browser driver. */
  captureScreenshots?: boolean;
  /** Override frontier budgets for live / agentic crawls. */
  budgets?: {
    maxStates?: number;
    wallClockMs?: number;
    politenessDelayMs?: number;
    maxModelCalls?: number;
    frontierBatchSize?: number;
    maxFanout?: number;
    maxVisitedVariants?: number;
    maxExercisePerBatch?: number;
  };
};

export type ExploreSessionResult = {
  session: Session;
  map: CapabilityMap;
  choiceSource: ChoiceSource;
  modelCalls: number;
  exitReason: ExploreResult["exitReason"];
};

class UnavailableModel implements ModelClient {
  async complete(): Promise<never> {
    throw new Error("MODEL_UNAVAILABLE");
  }
}

function agentContext(context: RunContext, model: ModelClient): AgentContext {
  return {
    model,
    clock: context.clock,
    transcript: {
      persist: async () => context.ids.next("ev"),
    },
  };
}

/**
 * Run exploration for a session: optional auth → explore() → rank → persist.
 * Agents never touch the store; this orchestrator seam owns persistence (06 §2.3).
 */
export async function exploreSession(options: {
  store: ForgeStore;
  context: RunContext;
  input: ExploreSessionInput;
  sessionId?: string;
}): Promise<ExploreSessionResult> {
  const { store, context, input } = options;

  let session: Session;
  if (options.sessionId) {
    const existing = store.getSession(options.sessionId);
    if (existing === null) throw new Error(`Session not found: ${options.sessionId}`);
    session = existing;
  } else {
    session = store.createSession({
      url: input.url,
      ...(input.username !== undefined ? { username: input.username } : {}),
      ...(input.password !== undefined ? { password: input.password } : {}),
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      mode: "autopilot",
      budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
      live: true,
    });
  }

  store.commitSessionTransition(
    session.id,
    { status: "EXPLORING" },
    {
      sessionId: session.id,
      lapId: null,
      actor: "orchestrator",
      type: "explore.state",
      payload: { url: input.url },
    },
  );
  session = store.getSession(session.id)!;

  let authenticated = session.authenticated;
  let closeDriver: (() => Promise<void>) | null = null;
  let driver = input.driver;

  try {
    if (driver === undefined) {
      if (input.username !== undefined || input.password !== undefined) {
        const credentials: Credentials = {
          username: input.username ?? "",
          password: input.password ?? "",
        };
        const auth = await authenticateSession({
          store,
          sessionId: session.id,
          credentials,
          entryUrl: input.url,
          ...(input.headless !== undefined ? { headless: input.headless } : {}),
        });
        authenticated = auth.authenticated;
        session = store.getSession(session.id)!;
      }

      const live = await openLiveExploreDriver({
        clock: context.clock,
        ids: context.ids,
        entryUrl: input.url,
        ...(session.storageStatePath !== null
          ? { storageStatePath: session.storageStatePath }
          : {}),
        ...(input.headless !== undefined ? { headless: input.headless } : { headless: true }),
        ...(input.captureScreenshots === true
          ? { evidence: { store, sessionId: session.id } }
          : {}),
      });
      if (!live.ok) {
        throw new Error(live.error);
      }
      driver = live.ports;
      closeDriver = live.close;
    }

    const forceDeterministic =
      input.forceDeterministic === true || (process.env["FORGE_LLM_ENABLED"] ?? "true") === "false";

    const model = input.model ?? new UnavailableModel();
    const explored = await explore(
      {
        sessionId: session.id,
        url: input.url,
        authenticated,
        ...(input.intent !== undefined ? { intent: input.intent } : {}),
        forceDeterministic,
        budgets: {
          politenessDelayMs: input.driver ? 0 : (input.budgets?.politenessDelayMs ?? 300),
          ...(input.budgets?.maxStates !== undefined ? { maxStates: input.budgets.maxStates } : {}),
          ...(input.budgets?.wallClockMs !== undefined
            ? { wallClockMs: input.budgets.wallClockMs }
            : {}),
          ...(input.budgets?.maxModelCalls !== undefined
            ? { maxModelCalls: input.budgets.maxModelCalls }
            : {}),
          ...(input.budgets?.frontierBatchSize !== undefined
            ? { frontierBatchSize: input.budgets.frontierBatchSize }
            : {}),
          ...(input.budgets?.maxFanout !== undefined ? { maxFanout: input.budgets.maxFanout } : {}),
          ...(input.budgets?.maxVisitedVariants !== undefined
            ? { maxVisitedVariants: input.budgets.maxVisitedVariants }
            : {}),
          ...(input.budgets?.maxExercisePerBatch !== undefined
            ? { maxExercisePerBatch: input.budgets.maxExercisePerBatch }
            : {}),
        },
      },
      agentContext(context, model),
      driver,
    );

    if (!explored.ok) {
      store.commitSessionTransition(
        session.id,
        {
          status: "ERROR",
          exitCode: 3,
          finishedAt: context.clock.now().toISOString(),
        },
        {
          sessionId: session.id,
          lapId: null,
          actor: "orchestrator",
          type: "session.finished",
          payload: { status: "ERROR", error: explored.error.message },
        },
      );
      throw new Error(explored.error.message);
    }

    const ranked = applyRanking(
      explored.data.map,
      input.intent !== undefined ? { intent: input.intent } : {},
    );
    store.saveCapabilityMap(ranked, {
      choiceSource: explored.data.choiceSource,
      modelCalls: explored.data.modelCalls,
      exitReason: explored.data.exitReason,
    });

    store.commitSessionTransition(
      session.id,
      { status: "PRIORITISING" },
      {
        sessionId: session.id,
        lapId: null,
        actor: "orchestrator",
        type: "explore.finished",
        payload: { status: "PRIORITISING" },
      },
    );

    if (input.terminal !== false) {
      store.commitSessionTransition(
        session.id,
        {
          status: "COMPLETED",
          exitCode: 0,
          defectsFound: 0,
          finishedAt: context.clock.now().toISOString(),
        },
        {
          sessionId: session.id,
          lapId: null,
          actor: "orchestrator",
          type: "session.finished",
          payload: { status: "COMPLETED", exitCode: 0 },
        },
      );
    }

    session = store.getSession(session.id)!;
    return {
      session,
      map: ranked,
      choiceSource: explored.data.choiceSource,
      modelCalls: explored.data.modelCalls,
      exitReason: explored.data.exitReason,
    };
  } finally {
    if (closeDriver) await closeDriver();
  }
}
