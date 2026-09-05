export interface AccessibilityNode {
  role: string;
  name?: string | null;
  children?: AccessibilityNode[];
  ref?: string;
  bbox?: { x: number; y: number; width: number; height: number } | null;
  enabled?: boolean;
  focused?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  pressed?: boolean;
  level?: number;
  value?: string | number | null;
  placeholder?: string | null;
  autocomplete?: string | null;
  required?: boolean;
  readonly?: boolean;
  multiline?: boolean;
}

export interface AccessibilitySnapshot {
  nodes: AccessibilityNode[];
  url: string;
  title: string;
  timestamp: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  metadata: {
    interactivesCount: number;
    interactivesDropped: number;
  };
}

export interface DomFacts {
  inputs: Array<{
    type: string;
    name?: string | null;
    id?: string | null;
    autocomplete?: string | null;
    placeholder?: string | null;
    accessibleName?: string | null;
    ref: string;
  }>;
  forms: Array<{
    ref: string;
    action?: string | null;
    method?: string | null;
    inputs: string[];
    buttons: string[];
  }>;
  buttons: Array<{
    ref: string;
    accessibleName?: string | null;
    role?: string | null;
    landmark?: string | null;
  }>;
  landmarks: Array<{
    role: string;
    label?: string | null;
    refs: string[];
  }>;
}

export interface LoginForm {
  identityRef: string;
  passwordRef: string;
  submitRef: string;
  scopeRef: string | null;
  confidence: number;
}

export interface Affordance {
  id: string;
  stateId: string;
  ref: string;
  role: string;
  accessibleName: string | null;
  kind: "button" | "link" | "textbox" | "checkbox" | "radio" | "select" | "tab" | "menuitem" | "form" | "upload" | "other";
  enabled: boolean;
  destructive: boolean;
  observedNotExercised: boolean;
  notExercisedReason: string | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
}

export interface State {
  id: string;
  sessionId: string;
  signature: string;
  url: string;
  title: string;
  authRequired: boolean;
  snapshotEvidenceId: string;
  affordanceIds: string[];
  visitedVariants: number;
  discoveredAt: string;
}

export interface Transition {
  id: string;
  sessionId: string;
  fromStateId: string;
  toStateId: string;
  viaAffordanceId: string;
  action: "click" | "fill" | "select" | "navigate" | "back" | "submit";
  observedAt: string;
}

export interface Capability {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  entryStateId: string;
  stateIds: string[];
  exitConditions: string[];
  dependsOn: string[];
  risk: {
    score: number;
    factors: RiskFactors;
  };
  priorityRank: number;
}

export interface RiskFactors {
  authProximity: number;
  dataMutation: number;
  moneyOrPii: number;
  graphCentrality: number;
  affordanceDensity: number;
  statedIntent: number;
}

export interface CapabilityMap {
  sessionId: string;
  authenticated: boolean;
  states: State[];
  transitions: Transition[];
  capabilities: Capability[];
  apiHints: Array<{
    method: string;
    urlPattern: string;
    seenInStateIds: string[];
  }>;
  frontier: {
    discovered: number;
    explored: number;
    haltReason: "EXHAUSTED" | "STATE_BUDGET" | "TIME_BUDGET" | "CALL_BUDGET";
  };
}

export interface FrontierItem {
  fromStateId: string;
  fromSignature: string;
  affordance: Affordance;
  value: number;
}