import type { DiagnosisKind } from "../schema/index.js";

/** Error codes the pre-classifier switches on ([06 §1](docs/02-architecture/06-agent-contracts.md)). */
export type ToolErrorCode =
  | "ASSERTION_FAILED"
  | "LOCATOR_NOT_FOUND"
  | "LOCATOR_AMBIGUOUS"
  | "TIMEOUT"
  | "TARGET_UNREACHABLE"
  | "NAVIGATION_FAILED"
  | "UNKNOWN";

/**
 * Evidence bundle for `preClassify` — only the fields the ten rows need.
 * Pure input; no I/O ([13 §3](docs/03-algorithms/13-triage-and-healing.md)).
 */
export type EvidenceBundle = {
  runId: string;
  stepId: string;
  step: {
    kind: string;
    targetIntent: string;
    locator: string | null;
  };
  code: ToolErrorCode | string;
  message: string;
  expected: string | null;
  actual: string | null;
  /** ≥3 evidence ids required for a schema-valid diagnosis (`I-8`). */
  evidenceIds: readonly string[];
  /** Row 3 / V5: new uncaught console error since baseline. */
  newConsoleError: boolean;
  /** Row 3 / V5: new 5xx on a request path used by this flow. */
  new5xxOnFlowPath: boolean;
  /** Row 4: fraction of suite steps that failed with NAVIGATION_FAILED. */
  suiteNavFailRatio: number;
  /** Row 5: TIMEOUT and the single retry passed. */
  retryPassed: boolean;
  /** Row 6: same role + accessible name exists elsewhere in the snapshot. */
  sameRoleNameElsewhere: boolean;
  /** Row 8: normalised DOM hash unchanged vs baseline. */
  domHashUnchanged: boolean;
  /** Row 9: element resolved but accessible name changed non-numerically. */
  elementResolved: boolean;
  accessibleNameChangedNonNumerically: boolean;
};

export type PreClassification = {
  kind: DiagnosisKind;
  confidence: number;
  final: boolean;
  vetoes: string[];
  recommendedAction: "HEAL" | "FAIL" | "ESCALATE" | "RETRY";
  explanation: string;
  failureSignature: string;
  evidenceIds: string[];
  source: "deterministic";
};
