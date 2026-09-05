import type { Affordance, Scenario, StepKind, TestPlan } from "../schema/index.js";
import type { LocatorSpec } from "./locate.js";

/** Affordance lookup + capability label needed to ground and render a plan. */
export type CompileContext = {
  capabilityName: string;
  /** Affordance.ref → Affordance */
  affordancesByRef: ReadonlyMap<string, Affordance>;
  /** State.id → URL (for navigate / assertUrl fallbacks) */
  stateUrlById: ReadonlyMap<string, string>;
  /** Assessment score shown in the provenance header; never a timestamp. */
  assessmentScore: number;
  floor: number;
  planRound: number;
};

export type CompiledStep = {
  stepId: string;
  order: number;
  kind: StepKind;
  /** Playwright chain after `page`, e.g. `getByRole("button", { name: "Continue" })`. */
  locatorExpr: string | null;
  locatorSpec: LocatorSpec | null;
  input: string | null;
  /** Lines of TypeScript for this step (no trailing newline). */
  lines: string[];
};

export type CompiledScenario = {
  scenarioId: string;
  title: string;
  class: Scenario["class"];
  priority: Scenario["priority"];
  steps: CompiledStep[];
};

export type CompiledFile = {
  /** Path relative to the emitted project root. */
  relativePath: string;
  content: string;
};

export type CompiledSuite = {
  plan: TestPlan;
  capabilityName: string;
  assessmentScore: number;
  floor: number;
  scenarios: CompiledScenario[];
  /** Spec file(s) only — one per capability (FR-408). */
  specs: CompiledFile[];
};

export type EmitMeta = {
  sessionId: string;
  planId: string;
  modelId: string;
  browserRevision: string;
  /** Sidecar only — excluded from byte-identity of `.spec.ts`. */
  createdAt: string;
};

export type EmittedProject = {
  files: CompiledFile[];
};
