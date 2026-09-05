import { ASSERTION_KINDS } from "../schema/index.js";
import { failureSignature, numericOnlyDelta, stripVolatile } from "./text.js";
import type { EvidenceBundle, PreClassification } from "./types.js";

const ASSERTION_KIND_SET = new Set<string>(ASSERTION_KINDS);

type RowMatch = {
  kind: PreClassification["kind"];
  confidence: number;
  final: boolean;
  veto: string | null;
  action: PreClassification["recommendedAction"];
  explanation: string;
};

/**
 * Ten-row deterministic pre-classifier ([13 §3](docs/03-algorithms/13-triage-and-healing.md)).
 *
 * First match wins for `kind` / `confidence` / `final`.
 * Every matching row contributes its veto id (`16 §11.1`).
 * Rows 1–5 are `final: true` → zero model calls (`I-6`).
 */
export function preClassify(bundle: EvidenceBundle): PreClassification {
  const matches: RowMatch[] = [];

  // Row 1 — assertion step + ASSERTION_FAILED → PRODUCT_BUG, V1, final
  if (ASSERTION_KIND_SET.has(bundle.step.kind) && bundle.code === "ASSERTION_FAILED") {
    matches.push({
      kind: "PRODUCT_BUG",
      confidence: 0.95,
      final: true,
      veto: "V1",
      action: "FAIL",
      explanation: "Assertion step failed: the locator found the element and the claim was false.",
    });
  }

  // Row 2 — numeric/currency-only delta → PRODUCT_BUG, V3, final
  if (
    bundle.expected !== null &&
    bundle.actual !== null &&
    numericOnlyDelta(bundle.expected, bundle.actual)
  ) {
    matches.push({
      kind: "PRODUCT_BUG",
      confidence: 0.95,
      final: true,
      veto: "V3",
      action: "FAIL",
      explanation: "Expected and actual differ only in numeric or currency tokens.",
    });
  }

  // Row 3 — new console error or 5xx → PRODUCT_BUG, V5, final
  if (bundle.newConsoleError || bundle.new5xxOnFlowPath) {
    matches.push({
      kind: "PRODUCT_BUG",
      confidence: 0.9,
      final: true,
      veto: "V5",
      action: "FAIL",
      explanation: "New console error or 5xx on a flow path since the baseline run.",
    });
  }

  // Row 4 — unreachable / majority NAVIGATION_FAILED → ENVIRONMENT, final
  if (bundle.code === "TARGET_UNREACHABLE" || bundle.suiteNavFailRatio >= 0.5) {
    matches.push({
      kind: "ENVIRONMENT",
      confidence: 0.9,
      final: true,
      veto: null,
      action: "FAIL",
      explanation: "Target unreachable or majority of suite steps failed navigation.",
    });
  }

  // Row 5 — TIMEOUT with retry passed → FLAKY, final
  if (bundle.code === "TIMEOUT" && bundle.retryPassed) {
    matches.push({
      kind: "FLAKY",
      confidence: 0.85,
      final: true,
      veto: null,
      action: "RETRY",
      explanation: "Timeout recovered on a single retry — quarantined as flaky.",
    });
  }

  // Row 6 — LOCATOR_NOT_FOUND + same role/name elsewhere → LOCATOR_BREAK
  if (bundle.code === "LOCATOR_NOT_FOUND" && bundle.sameRoleNameElsewhere) {
    matches.push({
      kind: "LOCATOR_BREAK",
      confidence: 0.8,
      final: false,
      veto: null,
      action: "HEAL",
      explanation: "Locator missed; an element with the same role and name exists elsewhere.",
    });
  }

  // Row 7 — LOCATOR_AMBIGUOUS → LOCATOR_BREAK
  if (bundle.code === "LOCATOR_AMBIGUOUS") {
    matches.push({
      kind: "LOCATOR_BREAK",
      confidence: 0.6,
      final: false,
      veto: null,
      action: "HEAL",
      explanation: "Locator resolved ambiguously — address may need healing.",
    });
  }

  // Row 8 — LOCATOR_NOT_FOUND, no element, DOM unchanged → FLAKY
  if (
    bundle.code === "LOCATOR_NOT_FOUND" &&
    !bundle.sameRoleNameElsewhere &&
    bundle.domHashUnchanged
  ) {
    matches.push({
      kind: "FLAKY",
      confidence: 0.55,
      final: false,
      veto: null,
      action: "RETRY",
      explanation: "Locator missed while the DOM hash is unchanged — looked too early.",
    });
  }

  // Row 9 — resolved element, non-numeric name change → CONTENT_DRIFT
  if (bundle.elementResolved && bundle.accessibleNameChangedNonNumerically) {
    matches.push({
      kind: "CONTENT_DRIFT",
      confidence: 0.7,
      final: false,
      veto: null,
      action: "FAIL",
      explanation: "Element resolved but accessible name changed non-numerically.",
    });
  }

  // Row 10 — anything else → UNKNOWN
  if (matches.length === 0) {
    matches.push({
      kind: "UNKNOWN",
      confidence: 0.4,
      final: false,
      veto: null,
      action: "ESCALATE",
      explanation: "Evidence does not support a confident classification.",
    });
  }

  const first = matches[0]!;
  const vetoes = [...new Set(matches.map((m) => m.veto).filter((v): v is string => v !== null))];

  return {
    kind: first.kind,
    confidence: first.confidence,
    final: first.final,
    vetoes,
    recommendedAction: first.action,
    explanation: first.explanation,
    failureSignature: failureSignature([
      String(bundle.code),
      stripVolatile(bundle.message),
      bundle.step.targetIntent,
      bundle.domHashUnchanged ? "dom-same" : "dom-changed",
    ]),
    evidenceIds: [...bundle.evidenceIds],
    source: "deterministic",
  };
}
