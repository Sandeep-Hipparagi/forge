import { createHash } from "node:crypto";
import type {
  TestPlan,
  Scenario,
  TestStep,
  CapabilitySubgraph,
  Affordance,
  Capability,
} from "@forge/core";
import type { TestPlanDraft, ScenarioDraft, GroundingResult } from "./types.js";
import { ASSERTION_KINDS, ROLE_COMPATIBILITY } from "./types.js";

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(a|an|the|and|or|but|in|on|at|to|for|of|with|by)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function identityKey(scenario: Scenario | ScenarioDraft): string {
  const parts = [
    scenario.class,
    normalise(scenario.title),
    ...scenario.steps.map((st) => `${st.kind}:${normalise(st.targetIntent)}`),
  ];
  return createHash("sha256").update(parts.join("")).digest("hex").slice(0, 16);
}

function jaccardTokenSet(a: string, b: string): number {
  const tokensA = new Set(normalise(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalise(b).split(/\s+/).filter(Boolean));
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function stepSequenceRatio(stepsA: TestStep[], stepsB: TestStep[]): number {
  const seqA = stepsA.map((st) => `${st.kind}:${normalise(st.targetIntent)}`);
  const seqB = stepsB.map((st) => `${st.kind}:${normalise(st.targetIntent)}`);

  const m = seqA.length;
  const n = seqB.length;
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const row = dp[i];
      const prevRow = dp[i - 1];
      if (row && prevRow) {
        if (seqA[i - 1] === seqB[j - 1]) {
          row[j] = (prevRow[j - 1] ?? 0) + 1;
        } else {
          row[j] = Math.max(prevRow[j] ?? 0, row[j - 1] ?? 0);
        }
      }
    }
  }

  const finalRow = dp[m];
  return Math.max(m, n) > 0 ? (finalRow?.[n] ?? 0) / Math.max(m, n) : 1;
}

export function similarity(scenarioA: Scenario, scenarioB: Scenario): number {
  const titleScore = 0.6 * jaccardTokenSet(scenarioA.title, scenarioB.title);
  const stepScore = 0.4 * stepSequenceRatio(scenarioA.steps, scenarioB.steps);
  return titleScore + stepScore;
}

export function mergeScenarios(
  previousRounds: Scenario[][],
  newScenarios: Scenario[],
): Scenario[] {
  const merged: Scenario[] = [];
  const usedKeys = new Set<string>();

  // Find the highest existing SC number to continue from
  let nextIdCounter = 1;
  for (const round of previousRounds) {
    for (const scenario of round) {
      const match = scenario.id.match(/^SC-(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        nextIdCounter = Math.max(nextIdCounter, num + 1);
      }
    }
  }

  for (const newScenario of newScenarios) {
    const newKey = identityKey(newScenario);
    let matched = false;

    for (const round of previousRounds) {
      for (const oldScenario of round) {
        if (identityKey(oldScenario) === newKey) {
          merged.push({ ...newScenario, id: oldScenario.id });
          usedKeys.add(oldScenario.id);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) {
      for (const round of previousRounds) {
        for (const oldScenario of round) {
          if (usedKeys.has(oldScenario.id)) continue;
          if (similarity(newScenario, oldScenario) >= 0.8) {
            merged.push({ ...newScenario, id: oldScenario.id });
            usedKeys.add(oldScenario.id);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }

    if (!matched) {
      const newId = `SC-${String(nextIdCounter++).padStart(3, "0")}`;
      merged.push({ ...newScenario, id: newId });
    }
  }

  return merged;
}

function buildAffordanceMap(sub: CapabilitySubgraph): Map<string, Affordance> {
  const map = new Map<string, Affordance>();
  for (const aff of sub.affordances) {
    map.set(aff.ref, aff);
  }
  return map;
}

function buildStateMap(
  sub: CapabilitySubgraph,
): Map<string, CapabilitySubgraph["states"][number]> {
  const map = new Map<string, CapabilitySubgraph["states"][number]>();
  for (const state of sub.states) {
    map.set(state.id, state);
  }
  return map;
}

function findEntryState(
  sub: CapabilitySubgraph,
): CapabilitySubgraph["states"][number] | undefined {
  return sub.states.find((s) => s.id === sub.entryStateId);
}

function isReachableFromEntry(
  stateId: string,
  sub: CapabilitySubgraph,
): boolean {
  const entryState = findEntryState(sub);
  if (!entryState) return false;
  if (stateId === entryState.id) return true;

  const graph = new Map<string, Set<string>>();
  for (const trans of sub.transitions) {
    if (!graph.has(trans.fromStateId)) graph.set(trans.fromStateId, new Set());
    graph.get(trans.fromStateId)!.add(trans.toStateId);
  }

  const visited = new Set<string>();
  const queue = [entryState.id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === stateId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = graph.get(current);
    if (neighbors) {
      for (const n of neighbors) queue.push(n);
    }
  }
  return false;
}

export function ground(
  draft: TestPlanDraft,
  sub: CapabilitySubgraph,
  previousRounds: Scenario[][] = [],
): GroundingResult {
  const affordanceMap = buildAffordanceMap(sub);
  const stateMap = buildStateMap(sub);
  const dropped: GroundingResult["dropped"] = [];
  const survivingScenarios: Scenario[] = [];

  for (const draftScenario of draft.scenarios) {
    let scenarioDropped = false;

    for (let stepIdx = 0; stepIdx < draftScenario.steps.length; stepIdx++) {
      const step = draftScenario.steps[stepIdx];
      if (!step) continue;

      const state = stateMap.get(step.stateId);
      if (!state) {
        dropped.push({
          scenarioId: draftScenario.id,
          step: stepIdx,
          reason: "UNKNOWN_STATE",
        });
        scenarioDropped = true;
        break;
      }

      if (step.affordanceRef) {
        const affordance = affordanceMap.get(step.affordanceRef);
        if (!affordance) {
          dropped.push({
            scenarioId: draftScenario.id,
            step: stepIdx,
            reason: "UNKNOWN_AFFORDANCE",
          });
          scenarioDropped = true;
          break;
        }

        if (affordance.stateId !== step.stateId) {
          dropped.push({
            scenarioId: draftScenario.id,
            step: stepIdx,
            reason: "UNKNOWN_AFFORDANCE",
          });
          scenarioDropped = true;
          break;
        }

        const compatibleRoles = ROLE_COMPATIBILITY[step.kind] ?? [];
        if (
          compatibleRoles.length > 0 &&
          !compatibleRoles.includes(affordance.role)
        ) {
          dropped.push({
            scenarioId: draftScenario.id,
            step: stepIdx,
            reason: "KIND_MISMATCH",
          });
          scenarioDropped = true;
          break;
        }
      } else if (
        step.kind !== "navigate" &&
        !ASSERTION_KINDS.includes(step.kind as (typeof ASSERTION_KINDS)[number])
      ) {
        dropped.push({
          scenarioId: draftScenario.id,
          step: stepIdx,
          reason: "UNKNOWN_AFFORDANCE",
        });
        scenarioDropped = true;
        break;
      }
    }

    if (scenarioDropped) continue;

    const steps = [...draftScenario.steps].sort((a, b) => a.order - b.order);

    if (steps.length === 0) {
      dropped.push({
        scenarioId: draftScenario.id,
        step: 0,
        reason: "NO_ASSERTION",
      });
      continue;
    }

    const firstStep = steps[0];
    if (!firstStep || !isReachableFromEntry(firstStep.stateId, sub)) {
      dropped.push({
        scenarioId: draftScenario.id,
        step: 0,
        reason: "UNREACHABLE_START",
      });
      continue;
    }

    const hasAssertion = steps.some((step) =>
      ASSERTION_KINDS.includes(step.kind as (typeof ASSERTION_KINDS)[number]),
    );
    if (!hasAssertion) {
      dropped.push({
        scenarioId: draftScenario.id,
        step: steps.length - 1,
        reason: "NO_ASSERTION",
      });
      continue;
    }

    const finalScenario: Scenario = {
      id: draftScenario.id,
      planId: "",
      title: draftScenario.title,
      class: draftScenario.class,
      priority: draftScenario.priority,
      priorityReason: draftScenario.priorityReason,
      preconditions: draftScenario.preconditions,
      steps: steps.map((step) => ({
        ...step,
        fingerprintId: step.locatorStrategy ? null : undefined,
        resolvedCount: null,
      })) as TestStep[],
      expectedOutcome: draftScenario.expectedOutcome,
      source: draftScenario.source,
      sourceRefs: draftScenario.sourceRefs,
      plannedNotGenerated: draftScenario.plannedNotGenerated,
      notGeneratedReason: draftScenario.notGeneratedReason,
      version: 1,
      rationale: draftScenario.rationale,
    };
    survivingScenarios.push(finalScenario);
  }

  const mergedScenarios = mergeScenarios(previousRounds, survivingScenarios);
  const retry = mergedScenarios.length < 3;

  return {
    plan: {
      id: "pln_grounded",
      lapId: "",
      capabilityId: "",
      round: 0,
      scenarios: mergedScenarios,
      markdownPath: "",
      createdAt: "1970-01-01T00:00:00.000Z",
    } as TestPlan,
    dropped,
    retry,
  };
}

export function computePriorityCeiling(
  scenario: Scenario,
  capability: Capability,
): "P0" | "P1" | "P2" | "P3" {
  const riskScore = capability.risk.score;
  const isHappy = scenario.class === "happy";
  const hasMoneyPii = capability.risk.factors.moneyOrPii >= 1.0;

  if ((riskScore >= 0.7 && isHappy) || hasMoneyPii) return "P0";
  if (riskScore >= 0.7) return "P1";
  if (riskScore >= 0.45 && isHappy) return "P1";
  if (riskScore >= 0.45) return "P2";
  return "P3";
}

export function applyPriorityCeiling(
  scenario: Scenario,
  capability: Capability,
): { priority: "P0" | "P1" | "P2" | "P3"; priorityReason: string } {
  const ceiling = computePriorityCeiling(scenario, capability);
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const modelPriority = scenario.priority;

  if (order[modelPriority] > order[ceiling]) {
    return {
      priority: ceiling,
      priorityReason: `P${order[ceiling]}: ${ceiling === "P0" ? "capability risk >= 0.70, happy path" : ceiling === "P1" ? "capability risk >= 0.70 or happy path" : ceiling === "P2" ? "capability risk >= 0.45" : "default"}`,
    };
  }
  return { priority: modelPriority, priorityReason: scenario.priorityReason };
}

export type { GroundingResult } from "./types.js";
