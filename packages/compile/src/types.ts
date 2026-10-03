import type { Capability, CapabilitySubgraph } from "@forge/core";
import type { Page } from "@playwright/test";

export interface CompiledScenario {
  id: string;
  title: string;
  class: string;
  priority: string;
  steps: CompiledStep[];
  expectedOutcome: string;
}

export interface CompiledStep {
  id: string;
  order: number;
  kind: string;
  targetIntent: string;
  stateId: string;
  affordanceRef: string | null;
  locator: string | null;
  input: string | null;
  timeoutMs: number;
  optional: boolean;
  fingerprintId: string | null;
  resolvedCount: number | null;
}

export interface CompiledSuite {
  capabilityId: string;
  capabilityName: string;
  planId: string;
  round: number;
  scenarios: CompiledScenario[];
  provenance: {
    sessionId: string;
    planId: string;
    modelId: string;
    browserRevision: string;
    timestamp: string;
  };
}

export interface ValidatedSuite extends CompiledSuite {
  scenarios: ValidatedScenario[];
}

export interface ValidatedScenario extends CompiledScenario {
  steps: ValidatedStep[];
}

export interface ValidatedStep extends CompiledStep {
  resolvedCount: number;
  fingerprint: ElementFingerprint;
}

export interface ElementFingerprint {
  id: string;
  scenarioId: string;
  stepId: string;
  capturedInRunId: string;
  capturedAt: string;
  intent: string;
  role: string | null;
  accessibleName: string | null;
  text: string | null;
  tagName: string;
  testId: string | null;
  attributes: Record<string, string>;
  ancestorPath: Array<{
    tag: string;
    role: string | null;
    id: string | null;
  }>;
  siblingIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  viewport: { width: number; height: number; deviceScaleFactor: number };
  screenshotCropEvidenceId: string | null;
  computedStyle: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    display: string;
    visibility: string;
  };
}

export const LOCATOR_LADDER = [
  "role_name",
  "label",
  "placeholder",
  "text",
  "test_id",
  "alt_title",
  "dom_relative",
  "css",
] as const;

export type LocatorStrategy = (typeof LOCATOR_LADDER)[number];

export interface LocatorArgs {
  role?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  testId?: string;
  alt?: string;
  title?: string;
  selector?: string;
  relativeTo?: string;
}

export interface CompileContext {
  subgraph: CapabilitySubgraph;
  capability: Capability;
}

export interface ValidationContext {
  page: Page;
  storageState: string;
  baseUrl: string;
}

export interface CompileResult {
  suite: CompiledSuite;
  droppedScenarios: Array<{ scenarioId: string; reason: string }>;
}

export interface ValidationResult {
  suite: ValidatedSuite;
  droppedScenarios: Array<{ scenarioId: string; reason: string }>;
}
