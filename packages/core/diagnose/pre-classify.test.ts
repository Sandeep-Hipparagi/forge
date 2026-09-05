import { describe, expect, it } from "vitest";
import { preClassify } from "./pre-classify.js";
import type { EvidenceBundle } from "./types.js";

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    runId: "run_00000001",
    stepId: "s4",
    step: { kind: "click", targetIntent: "submit the order", locator: "#place-order" },
    code: "LOCATOR_NOT_FOUND",
    message: "locator('#place-order') resolved to 0",
    expected: null,
    actual: null,
    evidenceIds: ["ev_00000001", "ev_00000002", "ev_00000003"],
    newConsoleError: false,
    new5xxOnFlowPath: false,
    suiteNavFailRatio: 0,
    retryPassed: false,
    sameRoleNameElsewhere: true,
    domHashUnchanged: false,
    elementResolved: false,
    accessibleNameChangedNonNumerically: false,
    ...overrides,
  };
}

describe("preClassify · I-6 final implies zero model path", () => {
  it("a fired veto implies final = true", () => {
    const result = preClassify(
      bundle({
        step: { kind: "assertText", targetIntent: "order total", locator: null },
        code: "ASSERTION_FAILED",
        expected: "Pay ₹999",
        actual: "Pay ₹9,999",
      }),
    );
    expect(result.vetoes.length).toBeGreaterThan(0);
    expect(result.final).toBe(true);
    expect(result.source).toBe("deterministic");
  });

  it("final pre-classification is deterministic (stands alone — FR-605)", () => {
    const result = preClassify(
      bundle({
        step: { kind: "assertText", targetIntent: "heading", locator: null },
        code: "ASSERTION_FAILED",
        expected: "Welcome",
        actual: "Error",
      }),
    );
    expect(result.final).toBe(true);
    expect(result.kind).toBe("PRODUCT_BUG");
    expect(result.source).toBe("deterministic");
  });
});

describe("preClassify · 16 §11.1 first match + collect all vetoes", () => {
  it("EC-05 arm B: V1 wins kind/confidence/final; V3 also collected", () => {
    const result = preClassify(
      bundle({
        step: { kind: "assertText", targetIntent: "order total", locator: null },
        code: "ASSERTION_FAILED",
        expected: "Pay ₹999",
        actual: "Pay ₹9,999",
      }),
    );
    expect(result.kind).toBe("PRODUCT_BUG");
    expect(result.confidence).toBe(0.95);
    expect(result.final).toBe(true);
    expect(result.vetoes).toEqual(["V1", "V3"]);
  });

  it("V1 alone when delta is non-numeric (EC-06 M-12)", () => {
    const result = preClassify(
      bundle({
        step: { kind: "assertText", targetIntent: "welcome", locator: null },
        code: "ASSERTION_FAILED",
        expected: "Welcome back",
        actual: "Access denied",
      }),
    );
    expect(result.vetoes).toEqual(["V1"]);
    expect(result.kind).toBe("PRODUCT_BUG");
    expect(result.final).toBe(true);
  });
});

describe("preClassify · six causes", () => {
  it("row 6 → LOCATOR_BREAK healable hypothesis", () => {
    const result = preClassify(bundle());
    expect(result.kind).toBe("LOCATOR_BREAK");
    expect(result.final).toBe(false);
    expect(result.recommendedAction).toBe("HEAL");
    expect(result.failureSignature).toHaveLength(16);
  });

  it("row 4 → ENVIRONMENT final", () => {
    const result = preClassify(
      bundle({ code: "TARGET_UNREACHABLE", sameRoleNameElsewhere: false }),
    );
    expect(result.kind).toBe("ENVIRONMENT");
    expect(result.final).toBe(true);
  });

  it("row 5 → FLAKY final when retry passed", () => {
    const result = preClassify(
      bundle({ code: "TIMEOUT", retryPassed: true, sameRoleNameElsewhere: false }),
    );
    expect(result.kind).toBe("FLAKY");
    expect(result.final).toBe(true);
  });

  it("row 8 → FLAKY when DOM unchanged and no element", () => {
    const result = preClassify(bundle({ sameRoleNameElsewhere: false, domHashUnchanged: true }));
    expect(result.kind).toBe("FLAKY");
    expect(result.final).toBe(false);
  });

  it("row 10 → UNKNOWN", () => {
    const result = preClassify(
      bundle({
        code: "UNKNOWN",
        sameRoleNameElsewhere: false,
        domHashUnchanged: false,
      }),
    );
    expect(result.kind).toBe("UNKNOWN");
    expect(result.confidence).toBe(0.4);
  });
});
