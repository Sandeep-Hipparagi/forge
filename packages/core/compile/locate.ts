import type { Affordance, TestStep } from "../schema/index.js";

/** Structured locator for the Runner — never xpath, never positional. */
export type LocatorSpec =
  | { strategy: "role_name"; role: string; name: string }
  | { strategy: "role"; role: string }
  | { strategy: "test_id"; testId: string }
  | { strategy: "goto"; path: string };

/**
 * Pass 2 — strategy + affordance → Playwright locator expression (after `page`).
 * Sprint ladder: role+name → role → testid (when present on affordance.ref as data-testid hint).
 * Never emits xpath, .nth(), or .first() ([12 §3](docs/03-algorithms/12-generator.md)).
 */
export function locate(
  step: TestStep,
  affordance: Affordance | null,
  stateUrl?: string,
): { expr: string | null; spec: LocatorSpec | null } {
  if (step.kind === "navigate") {
    const path = pathnameOf(stateUrl ?? step.input ?? "/");
    return { expr: null, spec: { strategy: "goto", path } };
  }
  if (affordance === null) return { expr: null, spec: null };

  const role = affordance.role;
  const name = affordance.accessibleName;

  if (role && name) {
    const spec: LocatorSpec = { strategy: "role_name", role, name };
    return {
      expr: `getByRole(${quote(role)}, { name: ${quote(name)} })`,
      spec,
    };
  }
  if (role) {
    const spec: LocatorSpec = { strategy: "role", role };
    return { expr: `getByRole(${quote(role)})`, spec };
  }
  if (/^[a-z][a-z0-9_-]*$/i.test(affordance.ref) && !/^e\d+$/.test(affordance.ref)) {
    const spec: LocatorSpec = { strategy: "test_id", testId: affordance.ref };
    return { expr: `getByTestId(${quote(affordance.ref)})`, spec };
  }
  return { expr: null, spec: null };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}
