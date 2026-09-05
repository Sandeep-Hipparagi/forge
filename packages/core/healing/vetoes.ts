import { ASSERTION_KINDS } from "../schema/index.js";
import { numericOnlyDelta } from "../diagnose/text.js";
import { AMBIGUITY_MARGIN, DESTRUCTIVE_HEAL } from "./constants.js";

const ASSERTION_KIND_SET = new Set<string>(ASSERTION_KINDS);

export type VetoContext = {
  step: { kind: string };
  code: string;
  expected: string | null;
  actual: string | null;
  /** Fingerprint accessible name (or intent). */
  fingerprintName: string;
  /** New console error since baseline. */
  newConsoleError: boolean;
  /** New 5xx on a flow path since baseline. */
  new5xxOnFlowPath: boolean;
  /** Top eligible candidates already scored, highest first. */
  candidates: readonly { locator: string; score: number; accessibleName?: string | null }[];
};

export type VetoResult =
  | { blocked: false; vetoes: [] }
  | {
      blocked: true;
      vetoes: string[];
      verdict: "PRODUCT_BUG" | "ESCALATE";
      final: boolean;
      explanation: string;
    };

/**
 * Five hard vetoes — evaluated **before** decision gates ([13 §10](docs/03-algorithms/13-triage-and-healing.md)).
 * Collects every matching veto id (same first-match-wins for verdict kind as pre-classify).
 */
export function applyVetoes(ctx: VetoContext): VetoResult {
  const fired: { id: string; verdict: "PRODUCT_BUG" | "ESCALATE"; final: boolean; why: string }[] =
    [];

  // V1 — assertion target
  if (ASSERTION_KIND_SET.has(ctx.step.kind) && ctx.code === "ASSERTION_FAILED") {
    fired.push({
      id: "V1",
      verdict: "PRODUCT_BUG",
      final: true,
      why: "Assertion step failed; healing a truth claim is forbidden.",
    });
  }

  // V2 — destructive verb appears on a candidate while fingerprint was non-destructive
  const fpDestructive = DESTRUCTIVE_HEAL.test(ctx.fingerprintName);
  if (!fpDestructive) {
    for (const cand of ctx.candidates) {
      const name = cand.accessibleName ?? cand.locator;
      if (DESTRUCTIVE_HEAL.test(name)) {
        fired.push({
          id: "V2",
          verdict: "PRODUCT_BUG",
          final: true,
          why: `Destructive candidate blocked: fingerprint "${ctx.fingerprintName}" vs "${name}".`,
        });
        break;
      }
    }
  }

  // V3 — numeric / currency only delta
  if (ctx.expected !== null && ctx.actual !== null && numericOnlyDelta(ctx.expected, ctx.actual)) {
    fired.push({
      id: "V3",
      verdict: "PRODUCT_BUG",
      final: true,
      why: "Expected and actual differ only in numeric or currency tokens.",
    });
  }

  // V4 — top-two margin < 0.05
  if (ctx.candidates.length >= 2) {
    const margin = ctx.candidates[0]!.score - ctx.candidates[1]!.score;
    if (margin < AMBIGUITY_MARGIN) {
      fired.push({
        id: "V4",
        verdict: "ESCALATE",
        final: false,
        why: `Top-two margin ${margin.toFixed(4)} is below ${AMBIGUITY_MARGIN}.`,
      });
    }
  }

  // V5 — new runtime regression
  if (ctx.newConsoleError || ctx.new5xxOnFlowPath) {
    fired.push({
      id: "V5",
      verdict: "PRODUCT_BUG",
      final: true,
      why: "New console error or 5xx since baseline — application is on fire.",
    });
  }

  if (fired.length === 0) return { blocked: false, vetoes: [] };

  const first = fired[0]!;
  return {
    blocked: true,
    vetoes: fired.map((f) => f.id),
    verdict: first.verdict,
    final: first.final,
    explanation: first.why,
  };
}

/** I-3: an assertion-kind step never receives a patch. */
export function assertionStepMayReceivePatch(stepKind: string, code: string): boolean {
  if (ASSERTION_KIND_SET.has(stepKind) && code === "ASSERTION_FAILED") return false;
  return true;
}
