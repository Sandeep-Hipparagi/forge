import type { Transition, Affordance } from "@forge/core";

export interface CapabilitySubgraph {
  states: Array<{
    id: string;
    signature: string;
    url: string;
    title: string;
    snapshotYaml: string;
  }>;
  transitions: Transition[];
  affordances: Affordance[];
  entryStateId: string;
  exitConditions: string[];
  subgraphTruncated?: boolean;
}

export interface StructuralCoverage {
  affordanceCoverage: number;
  transitionCoverage: number;
  stateCoverage: number;
  classCoverage: number;
  assertionDensity: number;
  score: number;
  details: {
    affordances: { cited: number; eligible: number; ratio: number };
    transitions: { cited: number; total: number; ratio: number };
    states: { cited: number; total: number; ratio: number };
    classes: { present: number; total: number; ratio: number };
    assertions: { count: number; max: number; ratio: number };
  };
}

export interface Gap {
  id: string;
  class: "MISSING_FLOW" | "MISSING_EDGE_CASE" | "MISSING_ERROR_STATE";
  title: string;
  why: string;
  severity: "INFO" | "MINOR" | "MAJOR" | "BLOCKER";
  suggestedScenario: string;
  affordanceRefs: string[];
}

export interface CoverageAssessment {
  id: string;
  lapId: string;
  planId: string;
  round: number;
  score: number;
  floor: number;
  structural: StructuralCoverage["details"];
  gaps: Gap[];
  residualGaps: Gap[];
  prdGaps: Array<{
    requirement: string;
    prdSectionRef: string;
    severity: "INFO" | "MINOR" | "MAJOR" | "BLOCKER";
  }>;
  verdict: "PASS" | "REPLAN" | "ACCEPT_RISK";
  source: "deterministic" | "llm" | "llm+deterministic";
  createdAt: string;
}

export interface LapState {
  id: string;
  replanRounds: number;
  maxReplanRounds: number;
}

export const COVERAGE_FLOOR = 0.7;
export const MAX_REPLAN_ROUNDS = 2;
export const GAP_CAP = 12;
export const PRD_GAP_CAP = 15;
