import type { Affordance, TestPlan } from "../schema/index.js";
import { locate } from "./locate.js";
import { normalise, orderedSteps } from "./normalise.js";
import { renderSpecFile, renderStep, slugCapability } from "./render.js";
import type { CompiledScenario, CompiledSuite, CompileContext } from "./types.js";

export type CompileOptions = {
  capabilityName: string;
  affordances: readonly Affordance[];
  states: readonly { id: string; url: string }[];
  assessmentScore?: number;
  floor?: number;
};

/**
 * Passes 1–3: pure, total, deterministic.
 * Same plan + context → byte-identical suite (`FR-401`).
 * Model output is never executed ([04 §8](docs/02-architecture/04-system-architecture.md)).
 */
export function compile(plan: TestPlan, options: CompileOptions): CompiledSuite {
  const normalised = normalise(plan);
  const ctx: CompileContext = {
    capabilityName: options.capabilityName,
    affordancesByRef: new Map(options.affordances.map((a) => [a.ref, a])),
    stateUrlById: new Map(options.states.map((s) => [s.id, s.url])),
    assessmentScore: options.assessmentScore ?? 0.7,
    floor: options.floor ?? 0.7,
    planRound: normalised.round,
  };

  const scenarios: CompiledScenario[] = [];
  for (const scenario of normalised.scenarios) {
    if (scenario.plannedNotGenerated) continue;
    const steps = orderedSteps(scenario).map((step) => {
      const aff =
        step.affordanceRef === null ? null : (ctx.affordancesByRef.get(step.affordanceRef) ?? null);
      const { expr, spec } = locate(step, aff, ctx.stateUrlById.get(step.stateId));
      return renderStep(step, expr, spec, ctx);
    });
    scenarios.push({
      scenarioId: scenario.id,
      title: scenario.title,
      class: scenario.class,
      priority: scenario.priority,
      steps,
    });
  }

  const slug = slugCapability(ctx.capabilityName);
  const scenarioIds = scenarios.map((s) => s.scenarioId);
  const content = renderSpecFile(
    ctx.capabilityName,
    normalised.capabilityId,
    normalised.id,
    normalised.round,
    ctx.assessmentScore,
    ctx.floor,
    scenarios,
    scenarioIds,
  );

  return {
    plan: normalised,
    capabilityName: ctx.capabilityName,
    assessmentScore: ctx.assessmentScore,
    floor: ctx.floor,
    scenarios,
    specs: [{ relativePath: `tests/generated/${slug}.spec.ts`, content }],
  };
}
