import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AccessibilityNode, AccessibilitySnapshot, DomFacts } from "./types.js";
import { affordancesOf, DESTRUCTIVE, stateSignature } from "./snapshot.js";
import { detectLoginForm } from "./login.js";

function snap(
  root: AccessibilityNode,
  url = "https://shop.test/cart?page=1",
): AccessibilitySnapshot {
  return { url, title: "Cart", root };
}

describe("stateSignature", () => {
  it("collapses numeric and uuid-like path segments", () => {
    const root: AccessibilityNode = {
      role: "main",
      name: null,
      children: [],
    };
    const a = stateSignature(snap(root, "https://shop.test/orders/8841/items?page=3"));
    const b = stateSignature(snap(root, "https://shop.test/orders/42/items?page=9"));
    expect(a).toEqual(b);
  });

  it("masks digits in control names so badge changes do not change the signature", () => {
    const base: AccessibilityNode = {
      role: "banner",
      name: null,
      children: [{ role: "link", name: "Cart (2)", ref: "e1" }],
    };
    const a = stateSignature(snap(base));
    const b = stateSignature(
      snap({
        ...base,
        children: [{ role: "link", name: "Cart (3)", ref: "e1" }],
      }),
    );
    expect(a).toEqual(b);
  });
});

describe("affordancesOf", () => {
  it("extracts interactive nodes and applies the destructive deny-list", () => {
    const root: AccessibilityNode = {
      role: "main",
      name: null,
      children: [
        { role: "button", name: "Place order", ref: "e1" },
        { role: "button", name: "Cancel", ref: "e2" },
        { role: "button", name: "Help", ref: "e3" },
      ],
    };
    const affs = affordancesOf(snap(root));
    expect(affs.map((a) => a.ref)).toEqual(["e1", "e2", "e3"]);
    const place = affs.find((a) => a.ref === "e1")!;
    const cancel = affs.find((a) => a.ref === "e2")!;
    const help = affs.find((a) => a.ref === "e3")!;
    expect(place.destructive).toBe(true);
    expect(place.observedNotExercised).toBe(true);
    expect(place.notExercisedReason).toBe("DENY_LIST");
    expect(cancel.destructive).toBe(true);
    expect(cancel.observedNotExercised).toBe(true);
    expect(cancel.notExercisedReason).toBe("DENY_LIST");
    expect(help.destructive).toBe(false);
    expect(help.observedNotExercised).toBe(false);
    expect(help.notExercisedReason).toBeNull();
    expect(DESTRUCTIVE.test("Place order")).toBe(true);
  });
});

function loadFixture(name: string): { snapshot: AccessibilitySnapshot; dom: DomFacts } {
  const repositoryRoot = join(__dirname, "..", "..", "..");
  const path = join(repositoryRoot, "fixtures", "perception", `${name}.snapshot.yaml`);
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as { snapshot: AccessibilitySnapshot; dom: DomFacts };
  return parsed;
}

describe("detectLoginForm", () => {
  const dom: DomFacts = {
    inputs: {
      e1: { type: "text", name: "username" },
      e2: { type: "password" },
    },
  };

  const root: AccessibilityNode = {
    role: "form",
    name: "Sign in",
    ref: "f1",
    children: [
      {
        role: "textbox",
        name: "Username",
        ref: "e1",
      },
      {
        role: "textbox",
        name: "Password",
        ref: "e2",
      },
      {
        role: "button",
        name: "Sign in",
        ref: "b1",
      },
    ],
  };

  it("detects a simple username/password/sign-in form with confidence 1.0", () => {
    const form = detectLoginForm(snap(root, "https://shop.test/login"), dom);
    expect(form).not.toBeNull();
    expect(form?.identityRef).toBe("e1");
    expect(form?.passwordRef).toBe("e2");
    expect(form?.submitRef).toBe("b1");
    expect(form?.scopeRef).toBe("f1");
    expect(form?.confidence).toBeCloseTo(1.0, 3);
  });

  it("reaches confidence 1.0 on all three perception fixtures with zero configuration", () => {
    for (const name of ["aperture-checkout", "saucedemo-login", "conduit-editor"] as const) {
      const { snapshot, dom: fixtureDom } = loadFixture(name);
      const form = detectLoginForm(snapshot, fixtureDom);
      expect(form, `fixture ${name} should have a detected login form`).not.toBeNull();
      expect(form!.confidence).toBeCloseTo(1.0, 3);
    }
  });
});
