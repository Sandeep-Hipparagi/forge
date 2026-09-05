import {
  assessCoverage,
  templatePlan,
  type CapabilitySubgraph,
  type RunContext,
} from "@forge/core";

export const FORGE_AGENT_PLANNER_VERSION = "0.0.0";

export type PlanStageInput = {
  subgraph: CapabilitySubgraph;
  lapId: string;
  capabilityId: string;
  round: number;
  ctx: RunContext;
};

/**
 * Deterministic planner stage — agentic call site deferred this sitting.
 * Honours `FORGE_LLM_ENABLED=false` by always using the affordance template.
 */
export function planCapability(input: PlanStageInput) {
  return templatePlan(input.subgraph, input.ctx.ids, {
    lapId: input.lapId,
    capabilityId: input.capabilityId,
    round: input.round,
    createdAt: input.ctx.clock.now().toISOString(),
  });
}

export type CritiqueStageInput = {
  plan: ReturnType<typeof templatePlan>["plan"];
  subgraph: CapabilitySubgraph;
  lapId: string;
  replanRounds: number;
  rationale?: string;
  ctx: RunContext;
};

/** Structural critic only — semantic half deferred (`FORGE_LLM_ENABLED=false`). */
export function critiquePlan(input: CritiqueStageInput) {
  const args: Parameters<typeof assessCoverage>[0] = {
    plan: input.plan,
    subgraph: input.subgraph,
    lap: { id: input.lapId, replanRounds: input.replanRounds },
    ids: input.ctx.ids,
    createdAt: input.ctx.clock.now().toISOString(),
  };
  if (input.rationale !== undefined) args.rationale = input.rationale;
  return assessCoverage(args);
}
