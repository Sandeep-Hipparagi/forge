import type { AccessibilitySnapshot, DomFacts } from "@forge/perception";
import { describe, expect, it } from "vitest";
import { isAuthenticated } from "./auth.js";

function snap(
  passwordPresent: boolean,
  extras: AccessibilitySnapshot["root"]["children"] = [],
  url = "https://shop.test/login",
): { snapshot: AccessibilitySnapshot; dom: DomFacts } {
  const children = [
    ...(passwordPresent
      ? [
          {
            role: "textbox" as const,
            name: "Password",
            ref: "e2",
          },
        ]
      : []),
    ...(extras ?? []),
  ];
  return {
    snapshot: {
      url,
      title: "Page",
      root: {
        role: "main",
        name: null,
        children,
      },
    },
    dom: {
      inputs: passwordPresent ? { e2: { type: "password" } } : {},
    },
  };
}

describe("isAuthenticated", () => {
  it("requires a signature change and password gone", () => {
    const before = snap(true);
    const after = snap(
      false,
      [{ role: "button", name: "Log out", ref: "e9" }],
      "https://shop.test/app",
    );
    expect(isAuthenticated(before.snapshot, after.snapshot, after.dom)).toBe(true);
  });

  it("accepts a post-auth affordance even if a password field remains", () => {
    const before = snap(true);
    const after = snap(true, [{ role: "button", name: "My account", ref: "e9" }]);
    // Force different signature via extra affordance + same password.
    expect(isAuthenticated(before.snapshot, after.snapshot, after.dom)).toBe(true);
  });

  it("rejects an unchanged page", () => {
    const before = snap(true);
    expect(isAuthenticated(before.snapshot, before.snapshot, before.dom)).toBe(false);
  });
});
