import type {
  TestPlan,
  Scenario,
  TestStep,
  CapabilitySubgraph,
  Affordance,
} from "@forge/core";
import type {
  CompiledSuite,
  CompiledScenario,
  CompiledStep,
  CompileContext,
  CompileResult,
} from "./types.js";
import {
  buildLocator,
  type LocatorStrategy,
  type LocatorArgs,
} from "./locator.js";
import { LOCATOR_LADDER } from "./types.js";
import { applyPriorityCeiling } from "@forge/planner";

function sortScenarios(scenarios: Scenario[]): Scenario[] {
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return [...scenarios].sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.id.localeCompare(b.id);
  });
}

function sortSteps(steps: TestStep[]): TestStep[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

function buildAffordanceMap(
  subgraph: CapabilitySubgraph,
): Map<string, Affordance> {
  const map = new Map<string, Affordance>();
  for (const aff of subgraph.affordances) {
    map.set(aff.ref, aff);
  }
  return map;
}

export function compile(
  plan: TestPlan,
  context: CompileContext,
): CompileResult {
  const { subgraph, capability } = context;
  const affordanceMap = buildAffordanceMap(subgraph);
  const droppedScenarios: Array<{ scenarioId: string; reason: string }> = [];
  const compiledScenarios: CompiledScenario[] = [];

  for (const scenario of sortScenarios(plan.scenarios)) {
    if (scenario.plannedNotGenerated) {
      droppedScenarios.push({
        scenarioId: scenario.id,
        reason: scenario.notGeneratedReason ?? "planned not generated",
      });
      continue;
    }

    const compiledSteps: CompiledStep[] = [];
    let scenarioDropped = false;

    for (const step of sortSteps(scenario.steps)) {
      const affordance = step.affordanceRef
        ? (affordanceMap.get(step.affordanceRef) ?? null)
        : null;
      let locator: string | null = null;

      // Steps that don't require locators
      const noLocatorKinds = [
        "navigate",
        "assertText",
        "assertVisible",
        "assertUrl",
        "assertCount",
      ];
      const needsLocator = !noLocatorKinds.includes(step.kind);

      if (needsLocator) {
        const proposedStrategy = (step.locatorStrategy ??
          "role_name") as LocatorStrategy;
        const args: LocatorArgs = (step.locatorArgs ?? {}) as LocatorArgs;

        // Try the proposed strategy first, then descend the ladder
        let found = false;
        const startIndex = LOCATOR_LADDER.indexOf(proposedStrategy);
        if (startIndex >= 0) {
          for (let i = startIndex; i < LOCATOR_LADDER.length; i++) {
            const strategy = LOCATOR_LADDER[i];
            if (!strategy) continue;
            const argsForStrategy = buildArgsForStrategy(
              strategy,
              args,
              affordance,
            );
            if (!argsForStrategy) continue;
            const loc = buildLocator(strategy, argsForStrategy, affordance);
            if (loc) {
              locator = loc;
              found = true;
              break;
            }
          }
        }

        if (!found && affordance) {
          // Try all strategies as fallback
          for (const strategy of LOCATOR_LADDER) {
            const argsForStrategy = buildArgsForStrategy(
              strategy,
              args,
              affordance,
            );
            if (!argsForStrategy) continue;
            const loc = buildLocator(strategy, argsForStrategy, affordance);
            if (loc) {
              locator = loc;
              found = true;
              break;
            }
          }
        }

        if (!locator && affordance) {
          // Last resort: try all strategies with affordance data
          for (const strategy of LOCATOR_LADDER) {
            const argsForStrategy = buildArgsForStrategy(
              strategy,
              step.locatorArgs ?? {},
              affordance,
            );
            if (!argsForStrategy) continue;
            const loc = buildLocator(strategy, argsForStrategy, affordance);
            if (loc) {
              locator = loc;
              break;
            }
          }
        }

        if (!locator) {
          droppedScenarios.push({
            scenarioId: scenario.id,
            reason: `LOCATOR_FAILED: step ${step.id} (${step.kind})`,
          });
          scenarioDropped = true;
          break;
        }
      } else {
        // Steps that don't need locators (navigate, assertions)
        locator = null;
      }

      compiledSteps.push({
        id: step.id,
        order: step.order,
        kind: step.kind,
        targetIntent: step.targetIntent,
        stateId: step.stateId,
        affordanceRef: step.affordanceRef,
        locator,
        input: step.input,
        timeoutMs: step.timeoutMs,
        optional: step.optional,
        fingerprintId: step.fingerprintId,
        resolvedCount: step.resolvedCount ?? null,
      });
    }

    if (scenarioDropped) continue;

    // Apply priority ceiling
    const { priority } = applyPriorityCeiling(scenario, capability);

    compiledScenarios.push({
      id: scenario.id,
      title: scenario.title,
      class: scenario.class,
      priority,
      steps: compiledSteps,
      expectedOutcome: scenario.expectedOutcome,
    });
  }

  compiledScenarios.sort((a, b) => {
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
    const priorityDelta =
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 99) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 99);
    return priorityDelta || a.id.localeCompare(b.id);
  });

  const suite: CompiledSuite = {
    capabilityId: capability.id,
    capabilityName: capability.name,
    planId: plan.id,
    round: plan.round,
    scenarios: compiledScenarios,
    provenance: {
      sessionId: "",
      planId: plan.id,
      modelId: "",
      browserRevision: "",
      timestamp: "1970-01-01T00:00:00.000Z",
    },
  };

  return { suite, droppedScenarios };
}

function buildArgsForStrategy(
  strategy: LocatorStrategy,
  args: LocatorArgs,
  affordance: Affordance | null,
): LocatorArgs | null {
  const name = args.name ?? affordance?.accessibleName;
  const role = args.role ?? affordance?.role;

  switch (strategy) {
    case "role_name":
      return role && name ? { role, name } : null;
    case "label":
      return args.label ? { label: args.label } : name ? { label: name } : null;
    case "placeholder":
      return args.placeholder ? { placeholder: args.placeholder } : null;
    case "text":
      return args.text ? { text: args.text } : name ? { text: name } : null;
    case "test_id":
      return args.testId ? { testId: args.testId } : null;
    case "alt_title":
      return args.alt
        ? { alt: args.alt }
        : args.title
          ? { title: args.title }
          : null;
    case "dom_relative":
      return args.selector && args.relativeTo
        ? { selector: args.selector, relativeTo: args.relativeTo }
        : null;
    case "css":
      return args.selector ? { selector: args.selector } : null;
    default:
      return null;
  }
}
