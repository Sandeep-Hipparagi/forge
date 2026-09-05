import type { Affordance, CapabilityMap, Clock, IdGen, State, Transition } from "@forge/core";
import type { ToolError, ToolResult } from "@forge/agent-harness";
import type { SnapshotAffordance } from "@forge/perception";

export type HaltReason = CapabilityMap["frontier"]["haltReason"];

export type FrontierObservation = {
  url: string;
  title: string;
  signature: string;
  snapshotEvidenceId: string;
  affordances: SnapshotAffordance[];
  authRequired?: boolean;
};

export type FrontierItem = {
  fromSignature: string;
  fromStateId: string;
  affordanceId: string;
  ref: string;
  role: string;
  accessibleName: string | null;
  kind: Affordance["kind"];
  value: number;
  restoreAttempts: number;
};

export type FrontierBudgets = {
  maxStates: number;
  wallClockMs: number;
  maxModelCalls: number;
  frontierBatchSize: number;
  maxFanout: number;
  maxVisitedVariants: number;
  politenessDelayMs: number;
};

export const DEFAULT_FRONTIER_BUDGETS: FrontierBudgets = {
  maxStates: 40,
  wallClockMs: 90_000,
  maxModelCalls: 8,
  frontierBatchSize: 40,
  maxFanout: 12,
  maxVisitedVariants: 20,
  politenessDelayMs: 300,
};

export type ExerciseOutcome = ToolResult<{ action: Transition["action"] }>;

export type FrontierPorts = {
  clock: Clock;
  ids: IdGen;
  observe: () => Promise<FrontierObservation>;
  restore: (state: State) => Promise<{ matched: boolean }>;
  exercise: (item: FrontierItem, affordance: Affordance) => Promise<ExerciseOutcome>;
  /**
   * Model (or deterministic fallback) chooses which batch items to expand.
   * Each invocation counts against `maxModelCalls` (CALL_BUDGET).
   */
  chooseBatch: (
    batch: FrontierItem[],
    states: ReadonlyMap<string, State>,
  ) => Promise<FrontierItem[]>;
  delay: (ms: number) => Promise<void>;
};

export type FrontierRunInput = {
  sessionId: string;
  origin: string;
  authenticated?: boolean;
  budgets?: Partial<FrontierBudgets>;
};

export type FrontierGraph = {
  states: State[];
  affordances: Affordance[];
  transitions: Transition[];
  frontier: CapabilityMap["frontier"];
};

const NAVIGATIONAL_ROLES = new Set(["link", "tab", "menuitem"]);
const FORM_SUBMIT_KINDS = new Set(["button", "form"]);

function isoNow(clock: Clock): string {
  return clock.now().toISOString();
}

export function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

export function isOffOrigin(candidateUrl: string, origin: string): boolean {
  try {
    return new URL(candidateUrl).origin !== new URL(origin).origin;
  } catch {
    return true;
  }
}

export function scoreAffordanceValue(
  affordance: Pick<Affordance, "role" | "kind" | "accessibleName">,
  stateFanoutSoFar: number,
  maxFanout: number,
): number {
  const isNavigational = NAVIGATIONAL_ROLES.has(affordance.role) ? 1 : 0;
  const isFormSubmit =
    FORM_SUBMIT_KINDS.has(affordance.kind) &&
    /submit|continue|sign ?in|log ?in|next|save|apply|confirm/i.test(
      affordance.accessibleName ?? "",
    )
      ? 1
      : 0;
  const nameInformative =
    affordance.accessibleName !== null &&
    affordance.accessibleName.trim().length > 0 &&
    !/^[\p{So}\p{Sk}]+$/u.test(affordance.accessibleName.trim())
      ? 1
      : 0;
  const fanout = maxFanout <= 0 ? 0 : Math.max(0, 1 - stateFanoutSoFar / maxFanout);

  return 0.4 * isNavigational + 0.25 * isFormSubmit + 0.2 * nameInformative + 0.15 * fanout;
}

export function sortFrontierItems(items: FrontierItem[]): FrontierItem[] {
  return [...items].sort((left, right) => {
    if (left.value !== right.value) return right.value - left.value;
    const byState = left.fromStateId.localeCompare(right.fromStateId);
    if (byState !== 0) return byState;
    return left.ref.localeCompare(right.ref);
  });
}

/**
 * Deterministic no-model fallback for call site 1 (§3.5): top min(6, batch) by value.
 */
export function chooseBatchFallback(batch: FrontierItem[]): FrontierItem[] {
  return sortFrontierItems(batch).slice(0, Math.min(6, batch.length));
}

function transitionKey(from: string, via: string, to: string): string {
  return `${from}|${via}|${to}`;
}

export async function runFrontier(
  ports: FrontierPorts,
  input: FrontierRunInput,
): Promise<FrontierGraph> {
  const budgets: FrontierBudgets = { ...DEFAULT_FRONTIER_BUDGETS, ...input.budgets };
  const startedAt = ports.clock.monotonicMs();
  let politenessDelayMs = budgets.politenessDelayMs;
  let lastExerciseAt = startedAt - politenessDelayMs;
  let modelCalls = 0;
  let explored = 0;
  let haltReason: HaltReason | null = null;

  const statesBySignature = new Map<string, State>();
  const statesById = new Map<string, State>();
  const affordancesById = new Map<string, Affordance>();
  const affordanceKeyToId = new Map<string, string>();
  const transitionsByKey = new Map<string, Transition>();
  const frontier: FrontierItem[] = [];
  const frontierKeys = new Set<string>();
  const fanoutByState = new Map<string, number>();

  const budgetHaltNow = (opts?: { includeCalls?: boolean }): HaltReason | null => {
    if (ports.clock.monotonicMs() - startedAt >= budgets.wallClockMs) return "TIME_BUDGET";
    if (statesBySignature.size >= budgets.maxStates) return "STATE_BUDGET";
    if ((opts?.includeCalls ?? true) && modelCalls >= budgets.maxModelCalls) {
      return "CALL_BUDGET";
    }
    return null;
  };

  const markNotExercised = (affordance: Affordance, reason: string): void => {
    affordance.observedNotExercised = true;
    affordance.notExercisedReason = reason;
  };

  const enqueue = (state: State, affordance: Affordance): void => {
    const itemKey = `${state.signature}|${affordance.ref}`;
    if (frontierKeys.has(itemKey)) return;
    const fanout = fanoutByState.get(state.id) ?? 0;
    frontier.push({
      fromSignature: state.signature,
      fromStateId: state.id,
      affordanceId: affordance.id,
      ref: affordance.ref,
      role: affordance.role,
      accessibleName: affordance.accessibleName,
      kind: affordance.kind,
      value: scoreAffordanceValue(affordance, fanout, budgets.maxFanout),
      restoreAttempts: 0,
    });
    frontierKeys.add(itemKey);
    fanoutByState.set(state.id, fanout + 1);
  };

  const admitAffordance = (
    state: State,
    observed: SnapshotAffordance,
    options: { admitToFrontier: boolean; forceReason?: string },
  ): Affordance => {
    const key = `${state.id}|${observed.ref}`;
    const existingId = affordanceKeyToId.get(key);
    if (existingId) {
      return affordancesById.get(existingId)!;
    }

    const affordance: Affordance = {
      id: ports.ids.next("af"),
      stateId: state.id,
      ref: observed.ref,
      role: observed.role,
      accessibleName: observed.accessibleName,
      kind: observed.kind,
      enabled: observed.enabled,
      bbox: observed.bbox,
      destructive: observed.destructive,
      observedNotExercised: observed.observedNotExercised,
      notExercisedReason: observed.notExercisedReason,
    };
    affordancesById.set(affordance.id, affordance);
    affordanceKeyToId.set(key, affordance.id);
    if (!state.affordanceIds.includes(affordance.id)) {
      state.affordanceIds.push(affordance.id);
    }

    if (options.forceReason) {
      markNotExercised(affordance, options.forceReason);
      return affordance;
    }
    if (!affordance.enabled) {
      markNotExercised(affordance, "DISABLED");
      return affordance;
    }
    if (affordance.destructive) {
      markNotExercised(affordance, "DENY_LIST");
      return affordance;
    }

    const href = observed.href ?? null;
    if (href) {
      const absolute = resolveUrl(state.url, href);
      if (absolute !== null && isOffOrigin(absolute, input.origin)) {
        markNotExercised(affordance, "OFF_ORIGIN");
        return affordance;
      }
    }

    if (options.admitToFrontier) {
      enqueue(state, affordance);
    }
    return affordance;
  };

  const admit = (observation: FrontierObservation): State | null => {
    const existing = statesBySignature.get(observation.signature);

    if (existing) {
      existing.visitedVariants += 1;
      const admitNew = existing.visitedVariants <= budgets.maxVisitedVariants;
      for (const observed of observation.affordances) {
        const key = `${existing.id}|${observed.ref}`;
        if (!admitNew && !affordanceKeyToId.has(key)) {
          admitAffordance(existing, observed, {
            admitToFrontier: false,
            forceReason: "VARIANT_CAP",
          });
          continue;
        }
        admitAffordance(existing, observed, { admitToFrontier: admitNew });
      }
      return existing;
    }

    if (statesBySignature.size >= budgets.maxStates) {
      return null;
    }

    const state: State = {
      id: ports.ids.next("st"),
      sessionId: input.sessionId,
      signature: observation.signature,
      url: observation.url,
      title: observation.title,
      authRequired: observation.authRequired ?? false,
      snapshotEvidenceId: observation.snapshotEvidenceId,
      affordanceIds: [],
      visitedVariants: 1,
      discoveredAt: isoNow(ports.clock),
    };
    statesBySignature.set(state.signature, state);
    statesById.set(state.id, state);
    fanoutByState.set(state.id, 0);

    const atBudget = statesBySignature.size >= budgets.maxStates;
    for (const observed of observation.affordances) {
      admitAffordance(state, observed, {
        admitToFrontier: !atBudget,
        ...(atBudget ? { forceReason: "STATE_BUDGET" } : {}),
      });
    }
    return state;
  };

  const waitForPoliteness = async (): Promise<void> => {
    const elapsed = ports.clock.monotonicMs() - lastExerciseAt;
    const waitMs = Math.max(0, politenessDelayMs - elapsed);
    if (waitMs > 0) {
      await ports.delay(waitMs);
    }
  };

  const widenPoliteness = (error: ToolError): void => {
    if (
      error.code === "TARGET_UNREACHABLE" ||
      /429|503|rate.?limit/i.test(error.message) ||
      (error.detail !== undefined &&
        typeof error.detail === "object" &&
        "status" in error.detail &&
        (error.detail.status === 429 || error.detail.status === 503))
    ) {
      politenessDelayMs = Math.min(politenessDelayMs * 2, budgets.wallClockMs);
    }
  };

  const requeue = (item: FrontierItem): void => {
    const key = `${item.fromSignature}|${item.ref}`;
    if (frontierKeys.has(key)) return;
    frontier.push(item);
    frontierKeys.add(key);
  };

  admit(await ports.observe());

  while (frontier.length > 0) {
    const earlyHalt = budgetHaltNow();
    if (earlyHalt) {
      haltReason = earlyHalt;
      break;
    }

    const sorted = sortFrontierItems(frontier);
    frontier.length = 0;
    frontierKeys.clear();
    frontier.push(...sorted);
    for (const item of frontier) {
      frontierKeys.add(`${item.fromSignature}|${item.ref}`);
    }

    const batch = frontier.splice(0, budgets.frontierBatchSize);
    for (const item of batch) {
      frontierKeys.delete(`${item.fromSignature}|${item.ref}`);
    }

    if (modelCalls >= budgets.maxModelCalls) {
      haltReason = "CALL_BUDGET";
      for (const item of batch) requeue(item);
      break;
    }

    modelCalls += 1;
    const chosen = await ports.chooseBatch(batch, statesBySignature);
    const chosenKeys = new Set(chosen.map((item) => `${item.fromSignature}|${item.ref}`));
    for (const item of batch) {
      if (!chosenKeys.has(`${item.fromSignature}|${item.ref}`)) {
        requeue(item);
      }
    }

    for (let index = 0; index < chosen.length; index += 1) {
      // Call budget is per chooseBatch, not per expansion — only time/state bind mid-batch.
      const midHalt = budgetHaltNow({ includeCalls: false });
      if (midHalt) {
        haltReason = midHalt;
        for (const leftover of chosen.slice(index)) {
          requeue(leftover);
        }
        break;
      }

      const item = chosen[index]!;
      const from = statesById.get(item.fromStateId);
      if (!from) continue;
      const affordance = affordancesById.get(item.affordanceId);
      if (!affordance) continue;

      const restored = await ports.restore(from);
      if (!restored.matched) {
        if (item.restoreAttempts < 1) {
          item.restoreAttempts += 1;
          requeue(item);
        } else {
          markNotExercised(affordance, "RESTORE_MISMATCH");
        }
        continue;
      }

      await waitForPoliteness();
      const act = await ports.exercise(item, affordance);
      lastExerciseAt = ports.clock.monotonicMs();
      explored += 1;

      if (!act.ok) {
        markNotExercised(affordance, act.error.code);
        widenPoliteness(act.error);
        continue;
      }

      const to = admit(await ports.observe());
      if (to === null) {
        haltReason = "STATE_BUDGET";
        for (const leftover of chosen.slice(index + 1)) {
          requeue(leftover);
        }
        break;
      }

      const key = transitionKey(from.id, affordance.id, to.id);
      if (!transitionsByKey.has(key)) {
        transitionsByKey.set(key, {
          id: ports.ids.next("tr"),
          sessionId: input.sessionId,
          fromStateId: from.id,
          toStateId: to.id,
          viaAffordanceId: affordance.id,
          action: act.data.action,
          observedAt: isoNow(ports.clock),
        });
      }
    }

    if (haltReason) break;
  }

  if (haltReason === null) {
    haltReason = budgetHaltNow() ?? "EXHAUSTED";
  }

  // Affordances left on the frontier when a budget binds are claimed honestly.
  if (
    haltReason === "STATE_BUDGET" ||
    haltReason === "TIME_BUDGET" ||
    haltReason === "CALL_BUDGET"
  ) {
    for (const item of frontier) {
      const affordance = affordancesById.get(item.affordanceId);
      if (affordance && !affordance.observedNotExercised) {
        markNotExercised(affordance, haltReason);
      }
    }
  }

  return {
    states: [...statesBySignature.values()],
    affordances: [...affordancesById.values()],
    transitions: [...transitionsByKey.values()],
    frontier: {
      discovered: statesBySignature.size,
      explored,
      haltReason,
    },
  };
}
