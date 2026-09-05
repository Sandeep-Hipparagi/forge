import { describe, expect, it } from "vitest";
import {
  applyVetoes,
  assertionStepMayReceivePatch,
  BASE_TRUST,
  decide,
  canEnterHealing,
  FAIL_GATE,
  AUTO_HEAL_GATE,
  AMBIGUITY_MARGIN,
  scoreCandidates,
  ladderCandidate,
  applyPatch,
  verifyHeal,
  rollbackPatch,
} from "./index.js";
import type { ScoreInput } from "./score.js";

const fp: ScoreInput["fingerprint"] = {
  intent: "submit the order",
  role: "button",
  accessibleName: "Place order",
  text: "Place order",
  tagName: "button",
  ancestorPath: [
    { tag: "main", role: "main", id: "checkout-main" },
    { tag: "form", role: "form", id: "checkout-form" },
    { tag: "div", role: null, id: "order-actions" },
  ],
  siblingIndex: 1,
  bbox: { x: 1080, y: 728, w: 220, h: 48 },
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
};

const observedMatch = {
  role: "button" as const,
  accessibleName: "Place order",
  text: "Place order",
  tagName: "button",
  ancestorPath: [
    { tag: "main", role: "main" },
    { tag: "form", role: "form" },
    { tag: "div", role: null },
  ],
  siblingIndex: 1,
  bbox: { x: 1080, y: 728, w: 220, h: 48 },
};

describe("scoreCandidates · I-5 resolvedCount filter", () => {
  it("only resolvedCount === 1 is eligible, filtered before scoring", () => {
    const scored = scoreCandidates(
      { fingerprint: fp },
      [
        ladderCandidate(
          "role_name",
          "getByRole('button', { name: 'Place order' })",
          1,
          observedMatch,
        ),
        ladderCandidate("text", "getByText('Place order')", 2, observedMatch),
        ladderCandidate("css", "locator('button.primary')", 0, observedMatch),
      ],
      "diag_00000001",
    );
    expect(scored).toHaveLength(1);
    expect(scored[0]!.resolvedCount).toBe(1);
    expect(scored[0]!.strategy).toBe("role_name");
  });
});

describe("trust ceilings", () => {
  it("xpath_never_reaches_the_auto_heal_gate", () => {
    expect(BASE_TRUST.xpath).toBe(0.2);
    expect(BASE_TRUST.xpath).toBeLessThan(FAIL_GATE);
  });

  it("perfect sub-scores on geometry still cap at 0.35", () => {
    const scored = scoreCandidates(
      { fingerprint: fp },
      [ladderCandidate("geometry", "elementFromPoint(…)", 1, observedMatch)],
      "diag_00000001",
    );
    expect(scored[0]!.score).toBeLessThanOrEqual(0.35);
  });

  it("first_heal_can_never_exceed_0.90 when historical is 0", () => {
    const scored = scoreCandidates(
      { fingerprint: fp, history: [] },
      [
        ladderCandidate(
          "role_name",
          "getByRole('button', { name: 'Place order' })",
          1,
          observedMatch,
        ),
      ],
      "diag_00000001",
    );
    expect(scored[0]!.signals.historical).toBe(0);
    expect(scored[0]!.score).toBeLessThanOrEqual(0.9);
    expect(scored[0]!.score).toBeGreaterThanOrEqual(AUTO_HEAL_GATE);
  });
});

describe("vetoes · both halves (16 §8.1)", () => {
  it("V1_assertion_target_blocks_heal · fires", () => {
    const result = applyVetoes({
      step: { kind: "assertText" },
      code: "ASSERTION_FAILED",
      expected: "Welcome",
      actual: "Error",
      fingerprintName: "Welcome heading",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [],
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.vetoes).toContain("V1");
      expect(result.verdict).toBe("PRODUCT_BUG");
      expect(result.final).toBe(true);
    }
  });

  it("V1 does not fire on LOCATOR_NOT_FOUND for an assertion step", () => {
    const result = applyVetoes({
      step: { kind: "assertText" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Welcome heading",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [{ locator: "getByRole('heading')", score: 0.9 }],
    });
    expect(result.blocked).toBe(false);
  });

  it("V2_destructive_verb_blocks_heal even at 0.71 (EC-06)", () => {
    const result = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Place order",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [
        {
          locator: "getByRole('button', { name: 'Delete order' })",
          score: 0.71,
          accessibleName: "Delete order",
        },
      ],
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.vetoes).toContain("V2");
      expect(result.final).toBe(true);
    }
  });

  it("V2 does not fire when fingerprint was already destructive", () => {
    const result = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Delete order",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [
        {
          locator: "getByRole('button', { name: 'Delete order' })",
          score: 0.9,
          accessibleName: "Delete order",
        },
      ],
    });
    expect(result.blocked).toBe(false);
  });

  it("V3_numeric_only_delta_blocks_heal · fires", () => {
    const result = applyVetoes({
      step: { kind: "assertText" },
      code: "ASSERTION_FAILED",
      expected: "Pay ₹999",
      actual: "Pay ₹9,999",
      fingerprintName: "total",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [],
    });
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.vetoes).toEqual(expect.arrayContaining(["V1", "V3"]));
  });

  it("V3 does not fire when change is non-numeric", () => {
    const result = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: "Pay ₹999",
      actual: "Buy ₹999",
      fingerprintName: "Pay",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [{ locator: "x", score: 0.9 }],
    });
    expect(result.vetoes ?? []).not.toContain("V3");
  });

  it("V4_ambiguous_margin_escalates · 0.0499 fires, 0.05 does not", () => {
    const fire = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Continue",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [
        { locator: "a", score: 0.8 },
        { locator: "b", score: 0.8 - 0.0499 },
      ],
    });
    expect(fire.blocked).toBe(true);
    if (fire.blocked) expect(fire.vetoes).toContain("V4");

    const clear = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Continue",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [
        { locator: "a", score: 0.8 },
        { locator: "b", score: 0.8 - 0.05 },
      ],
    });
    expect(clear.blocked).toBe(false);
  });

  it("V5_new_runtime_error_blocks_heal · new 5xx fires; baseline 5xx does not", () => {
    const fire = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Place order",
      newConsoleError: false,
      new5xxOnFlowPath: true,
      candidates: [{ locator: "x", score: 0.9 }],
    });
    expect(fire.blocked).toBe(true);
    if (fire.blocked) expect(fire.vetoes).toContain("V5");

    const clear = applyVetoes({
      step: { kind: "click" },
      code: "LOCATOR_NOT_FOUND",
      expected: null,
      actual: null,
      fingerprintName: "Place order",
      newConsoleError: false,
      new5xxOnFlowPath: false,
      candidates: [{ locator: "x", score: 0.9 }],
    });
    expect(clear.blocked).toBe(false);
  });

  it("I-3 · assertion-kind step never receives a patch", () => {
    expect(assertionStepMayReceivePatch("assertText", "ASSERTION_FAILED")).toBe(false);
    expect(assertionStepMayReceivePatch("click", "LOCATOR_NOT_FOUND")).toBe(true);
  });
});

describe("decision gates · both sides", () => {
  it("fail gate 0.6499 → FAIL · 0.65 → ESCALATE", () => {
    expect(decide([{ locator: "a", score: 0.6499 }]).kind).toBe("FAIL");
    expect(decide([{ locator: "a", score: 0.65 }]).kind).toBe("ESCALATE");
  });

  it("auto-heal gate 0.8499 → ESCALATE · 0.85 with margin → AUTO_HEAL", () => {
    expect(
      decide([
        { locator: "a", score: 0.8499 },
        { locator: "b", score: 0.7 },
      ]).kind,
    ).toBe("ESCALATE");
    expect(
      decide([
        { locator: "a", score: 0.85 },
        { locator: "b", score: 0.85 - AMBIGUITY_MARGIN - 0.001 },
      ]).kind,
    ).toBe("AUTO_HEAL");
  });

  it("TG-9 · any of the three conditions absent blocks the heal", () => {
    expect(
      canEnterHealing({
        kind: "LOCATOR_BREAK",
        vetoes: [],
        stepAttempts: 0,
        capabilityAttempts: 0,
      }),
    ).toBe(true);
    expect(
      canEnterHealing({
        kind: "PRODUCT_BUG",
        vetoes: [],
        stepAttempts: 0,
        capabilityAttempts: 0,
      }),
    ).toBe(false);
    expect(
      canEnterHealing({
        kind: "LOCATOR_BREAK",
        vetoes: ["V2"],
        stepAttempts: 0,
        capabilityAttempts: 0,
      }),
    ).toBe(false);
    expect(
      canEnterHealing({
        kind: "LOCATOR_BREAK",
        vetoes: [],
        stepAttempts: 2,
        capabilityAttempts: 0,
      }),
    ).toBe(false);
  });
});

describe("patch · verify · rollback (TG-10, I-7)", () => {
  const beforeContent = [
    "test('checkout', async ({ page }) => {",
    "  await page.locator('#place-order').click();",
    "});",
  ].join("\n");

  it("applies a locator rewrite and produces a unified diff", () => {
    const patch = applyPatch({
      beforeContent,
      beforeLocator: "locator('#place-order')",
      afterLocator: "getByRole('button', { name: 'Place order' })",
      beforeFileSha256: "a".repeat(64),
      scenarioId: "SC-001",
      stepId: "s4",
      runId: "run_00000001",
      appliedAt: "2026-01-01T00:00:00.000Z",
    });
    expect("error" in patch).toBe(false);
    if ("error" in patch) return;
    expect(patch.afterContent).toContain("getByRole('button', { name: 'Place order' })");
    expect(patch.afterContent).not.toContain("locator('#place-order')");
    expect(patch.diff).toContain("-");
    expect(patch.diff).toContain("+");
  });

  it("TG-10: failed full-flow verify rolls back byte-for-byte", () => {
    const patch = applyPatch({
      beforeContent,
      beforeLocator: "locator('#place-order')",
      afterLocator: "getByRole('button', { name: 'Place order' })",
      beforeFileSha256: "a".repeat(64),
      scenarioId: "SC-001",
      stepId: "s4",
      runId: "run_00000001",
      appliedAt: "2026-01-01T00:00:00.000Z",
    });
    if ("error" in patch) throw new Error(patch.error);

    const verification = verifyHeal({ healedStepRerun: true, fullFlowRerun: false });
    expect(verification.ok).toBe(false);
    expect(verification.status).toBe("ROLLBACK");

    const rolled = rollbackPatch(patch, beforeContent, "2026-01-01T00:00:01.000Z");
    expect(rolled.content).toBe(beforeContent);
    expect(rolled.patch.revertedAt).toBe("2026-01-01T00:00:01.000Z");
  });

  it("I-7: both reruns required for VERIFIED", () => {
    expect(verifyHeal({ healedStepRerun: true, fullFlowRerun: true })).toEqual({
      ok: true,
      status: "VERIFIED",
    });
  });
});
