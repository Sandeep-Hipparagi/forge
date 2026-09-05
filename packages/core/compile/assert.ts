import type { TestStep } from "../schema/index.js";

const ASSERTION_KINDS = new Set(["assertText", "assertVisible", "assertUrl", "assertCount"]);

export function isAssertion(kind: TestStep["kind"]): boolean {
  return ASSERTION_KINDS.has(kind);
}

/**
 * Pass 3 — turn assertion steps into concrete Playwright expect lines.
 * Action steps are rendered separately in render.ts.
 */
export function assertLines(
  step: TestStep,
  locatorExpr: string | null,
  stateUrl: string | undefined,
): string[] {
  switch (step.kind) {
    case "assertVisible": {
      if (locatorExpr === null) return [];
      return [`await expect(page.${locatorExpr}).toBeVisible();`];
    }
    case "assertText": {
      if (locatorExpr === null) return [];
      const text = step.input ?? step.targetIntent;
      return [`await expect(page.${locatorExpr}).toContainText(${JSON.stringify(text)});`];
    }
    case "assertUrl": {
      const url = step.input ?? stateUrl ?? "/";
      const path = pathnameOf(url);
      return [`await expect(page).toHaveURL(new RegExp(${JSON.stringify(escapeRegExp(path))}));`];
    }
    case "assertCount": {
      if (locatorExpr === null) return [];
      const n = Number.parseInt(step.input ?? "1", 10);
      return [`await expect(page.${locatorExpr}).toHaveCount(${Number.isFinite(n) ? n : 1});`];
    }
    default:
      return [];
  }
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
