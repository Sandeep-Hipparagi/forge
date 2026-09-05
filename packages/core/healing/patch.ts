/**
 * Patch the plan locator string inside a generated spec file (pure string ops).
 * Hashing is the caller's job — core stays I/O-free.
 */

export type PatchPlan = {
  /** Full current file content. */
  beforeContent: string;
  /** Locator expression currently in the file. */
  beforeLocator: string;
  /** Replacement locator expression. */
  afterLocator: string;
  /** Caller-supplied sha256 of beforeContent (64 hex). */
  beforeFileSha256: string;
  scenarioId: string;
  stepId: string;
  runId: string;
  appliedAt: string;
};

export type AppliedPatch = {
  before: string;
  after: string;
  afterContent: string;
  diff: string;
  beforeFileSha256: string;
  scenarioId: string;
  stepId: string;
  runId: string;
  appliedAt: string;
  verifiedAt: string | null;
  revertedAt: string | null;
};

export type VerificationResult = {
  healedStepRerun: boolean;
  fullFlowRerun: boolean;
};

/**
 * Apply a locator rewrite and produce a unified diff ([13 §12](docs/03-algorithms/13-triage-and-healing.md)).
 * Pure: no filesystem writes.
 */
export function applyPatch(plan: PatchPlan): AppliedPatch | { error: string } {
  if (!plan.beforeContent.includes(plan.beforeLocator)) {
    return { error: "before locator not found in file content" };
  }
  const afterContent = plan.beforeContent.replace(plan.beforeLocator, plan.afterLocator);
  if (afterContent === plan.beforeContent) {
    return { error: "patch produced no change" };
  }
  return {
    before: plan.beforeLocator,
    after: plan.afterLocator,
    afterContent,
    diff: unifiedDiff("spec.ts", plan.beforeContent, afterContent),
    beforeFileSha256: plan.beforeFileSha256,
    scenarioId: plan.scenarioId,
    stepId: plan.stepId,
    runId: plan.runId,
    appliedAt: plan.appliedAt,
    verifiedAt: null,
    revertedAt: null,
  };
}

/**
 * TG-10 / I-7: both reruns required. Anything less → rollback.
 */
export function verifyHeal(verification: VerificationResult): {
  ok: boolean;
  status: "VERIFIED" | "ROLLBACK";
} {
  if (verification.healedStepRerun && verification.fullFlowRerun) {
    return { ok: true, status: "VERIFIED" };
  }
  return { ok: false, status: "ROLLBACK" };
}

/**
 * Restore file content byte-for-byte and mark the patch reverted (`FR-710`).
 */
export function rollbackPatch(
  patch: AppliedPatch,
  beforeContent: string,
  revertedAt: string,
): { content: string; patch: AppliedPatch } {
  return {
    content: beforeContent,
    patch: { ...patch, revertedAt },
  };
}

function unifiedDiff(filename: string, before: string, after: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines: string[] = [`--- a/${filename}`, `+++ b/${filename}`, "@@"];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i++) {
    const left = beforeLines[i];
    const right = afterLines[i];
    if (left === right) {
      if (left !== undefined) lines.push(` ${left}`);
    } else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
  }
  return lines.join("\n");
}
