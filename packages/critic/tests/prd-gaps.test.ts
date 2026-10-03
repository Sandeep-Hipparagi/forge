import { describe, expect, it } from "vitest";
import {
  extractPrdRequirements,
  matchRequirementsToPlan,
  buildPrdGaps,
} from "../src/prd-gaps.js";

describe("extractPrdRequirements", () => {
  it("splits sections by headings", () => {
    const prd = `
# Checkout

The user must be able to place an order.

## Coupons

The system should apply valid coupons.
`;
    const requirements = extractPrdRequirements(prd);
    expect(requirements.length).toBeGreaterThanOrEqual(2);
    expect(
      requirements.some((r) => r.text.includes("must be able to place")),
    ).toBe(true);
    expect(requirements.some((r) => r.text.includes("should apply"))).toBe(
      true,
    );
  });

  it("assigns BLOCKER severity to 'must' and 'shall'", () => {
    const prd = `
# Checkout

The user must be able to place an order.
The system shall validate the card.
`;
    const requirements = extractPrdRequirements(prd);
    expect(requirements.every((r) => r.severity === "BLOCKER")).toBe(true);
  });

  it("assigns MAJOR severity to 'should'", () => {
    const prd = `
# Checkout

The system should send a confirmation email.
`;
    const requirements = extractPrdRequirements(prd);
    expect(requirements[0]!.severity).toBe("MAJOR");
  });

  it("assigns MINOR severity to 'may'", () => {
    const prd = `
# Checkout

The user may save their card for future.
`;
    const requirements = extractPrdRequirements(prd);
    expect(requirements[0]!.severity).toBe("MINOR");
  });

  it("ignores non-normative sentences", () => {
    const prd = `
# Checkout

This is a description of the checkout flow.
It explains how things work.
`;
    const requirements = extractPrdRequirements(prd);
    expect(requirements.length).toBe(0);
  });
});

describe("matchRequirementsToPlan", () => {
  const mockPlan = {
    scenarios: [
      {
        id: "SC-001",
        title: "Guest checkout with valid card",
        expectedOutcome: "Order confirmed with order number",
        steps: [],
      },
      {
        id: "SC-002",
        title: "Checkout applies tax and shipping",
        expectedOutcome: "Total includes tax and shipping",
        steps: [],
      },
    ],
  };

  it("matches requirement to scenario via Jaccard overlap", () => {
    const requirements = [
      {
        text: "The user must be able to place an order with a valid card",
        sectionRef: "§1",
        severity: "BLOCKER" as const,
      },
    ];
    // Create a plan with better token overlap
    const planWithOverlap = {
      scenarios: [
        {
          id: "SC-001",
          title: "Place order with valid card",
          expectedOutcome: "Order confirmed",
          steps: [],
        },
      ],
    };
    const matches = matchRequirementsToPlan(requirements, planWithOverlap);
    expect(matches[0]!.coveredBy).toBe("SC-001");
    expect(matches[0]!.verified).toBe(true);
  });

  it("marks unmatched requirements as unverified", () => {
    const requirements = [
      {
        text: "The user must be able to pay with cryptocurrency",
        sectionRef: "§1",
        severity: "BLOCKER" as const,
      },
    ];
    const matches = matchRequirementsToPlan(requirements, mockPlan);
    expect(matches[0]!.coveredBy).toBeUndefined();
    expect(matches[0]!.verified).toBe(false);
  });
});

describe("buildPrdGaps", () => {
  it("creates gaps only for unverified requirements", () => {
    const requirements = [
      {
        text: "Must place order",
        sectionRef: "§1",
        severity: "BLOCKER" as const,
      },
      {
        text: "Should send email",
        sectionRef: "§2",
        severity: "MAJOR" as const,
      },
    ];
    const req0 = requirements[0]!;
    const req1 = requirements[1]!;
    const matches = [
      { requirement: req0, coveredBy: "SC-001", verified: true },
      { requirement: req1, verified: false },
    ];
    const gaps = buildPrdGaps(requirements, matches, 15);
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.requirement).toBe("Should send email");
    expect(gaps[0]!.severity).toBe("MAJOR");
  });

  it("sorts by severity desc", () => {
    const requirements = [
      {
        text: "Must place order",
        sectionRef: "§1",
        severity: "BLOCKER" as const,
      },
      { text: "May save card", sectionRef: "§2", severity: "MINOR" as const },
      {
        text: "Should send email",
        sectionRef: "§3",
        severity: "MAJOR" as const,
      },
    ];
    const matches = requirements.map((r) => ({
      requirement: r,
      verified: false,
    }));
    const gaps = buildPrdGaps(requirements, matches, 15);
    expect(gaps[0]!.severity).toBe("BLOCKER");
    expect(gaps[1]!.severity).toBe("MAJOR");
    expect(gaps[2]!.severity).toBe("MINOR");
  });

  it("caps at PRD_GAP_CAP", () => {
    const requirements = Array.from({ length: 20 }, (_, i) => ({
      text: `Requirement ${i}`,
      sectionRef: `§${i}`,
      severity: "MINOR" as const,
    }));
    const matches = requirements.map((r) => ({
      requirement: r,
      verified: false,
    }));
    const gaps = buildPrdGaps(requirements, matches, 15);
    expect(gaps.length).toBe(15);
  });
});
