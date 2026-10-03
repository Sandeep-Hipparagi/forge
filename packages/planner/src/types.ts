import type { TestPlan } from "@forge/core";

export interface TestPlanDraft {
  scenarios: ScenarioDraft[];
}

export interface ScenarioDraft {
  id: string;
  title: string;
  class: "happy" | "negative" | "boundary" | "error_state";
  priority: "P0" | "P1" | "P2" | "P3";
  priorityReason: string;
  preconditions: string[];
  steps: TestStepDraft[];
  expectedOutcome: string;
  source: "agent" | "prd" | "intent" | "critic_gap" | "human";
  sourceRefs: string[];
  plannedNotGenerated: boolean;
  notGeneratedReason: string | null;
  rationale: string;
}

export interface TestStepDraft {
  id: string;
  order: number;
  kind:
    | "navigate"
    | "click"
    | "fill"
    | "select"
    | "press"
    | "hover"
    | "waitFor"
    | "assertText"
    | "assertVisible"
    | "assertUrl"
    | "assertCount";
  targetIntent: string;
  stateId: string;
  affordanceRef: string | null;
  locatorStrategy: string | null;
  locatorArgs: Record<string, unknown> | null;
  input: string | null;
  timeoutMs: number;
  optional: boolean;
}

export type DropReason =
  | "UNKNOWN_STATE"
  | "UNKNOWN_AFFORDANCE"
  | "KIND_MISMATCH"
  | "UNREACHABLE_START"
  | "NO_ASSERTION";

export interface GroundingResult {
  plan: TestPlan;
  dropped: Array<{ scenarioId: string; step: number; reason: DropReason }>;
  retry: boolean;
}

export const ASSERTION_KINDS = [
  "assertText",
  "assertVisible",
  "assertUrl",
  "assertCount",
] as const;

export const ROLE_COMPATIBILITY: Record<string, string[]> = {
  fill: ["textbox", "searchbox", "spinbutton"],
  select: ["combobox", "listbox"],
  click: ["button", "link", "menuitem", "tab", "checkbox", "radio"],
  press: ["button", "link", "menuitem", "tab"],
  hover: ["button", "link", "menuitem", "tab"],
  waitFor: [],
  assertText: [],
  assertVisible: [],
  assertUrl: [],
  assertCount: [],
};
