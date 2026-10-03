import type { LocatorStrategy, LocatorArgs } from "./types.js";
import type { Affordance } from "@forge/core";
import { LOCATOR_LADDER } from "./types.js";
import type { Page } from "@playwright/test";

export { LOCATOR_LADDER } from "./types.js";
export type { LocatorStrategy, LocatorArgs } from "./types.js";

export function buildLocator(
  strategy: LocatorStrategy,
  args: LocatorArgs,
  affordance?: Affordance | null,
): string | null {
  void affordance;
  switch (strategy) {
    case "role_name":
      if (!args.role || !args.name) return null;
      return `getByRole('${args.role}', { name: '${escapeString(args.name)}' })`;

    case "label":
      if (!args.label) return null;
      return `getByLabel('${escapeString(args.label)}')`;

    case "placeholder":
      if (!args.placeholder) return null;
      return `getByPlaceholder('${escapeString(args.placeholder)}')`;

    case "text":
      if (!args.text) return null;
      return `getByText('${escapeString(args.text)}', { exact: true })`;

    case "test_id":
      if (!args.testId) return null;
      return `getByTestId('${escapeString(args.testId)}')`;

    case "alt_title":
      if (args.alt) {
        return `getByAltText('${escapeString(args.alt)}')`;
      }
      if (args.title) {
        return `getByTitle('${escapeString(args.title)}')`;
      }
      return null;

    case "dom_relative":
      if (!args.selector || !args.relativeTo) return null;
      return `locator('${escapeString(args.relativeTo)}').locator('${escapeString(args.selector)}')`;

    case "css":
      if (!args.selector) return null;
      return `locator('${escapeString(args.selector)}')`;

    default:
      return null;
  }
}

function escapeString(s: string): string {
  return s
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

export async function resolveLocatorLadder(
  proposedStrategy: LocatorStrategy,
  args: LocatorArgs,
  affordance: Affordance,
  page: Page,
): Promise<{ locator: string; resolvedCount: number } | null> {
  const startIndex = LOCATOR_LADDER.indexOf(proposedStrategy);
  if (startIndex === -1) return Promise.resolve(null);

  for (let i = startIndex; i < LOCATOR_LADDER.length; i++) {
    const strategy = LOCATOR_LADDER[i];
    if (!strategy) continue;
    const locatorArgs = buildArgsForStrategy(strategy, args, affordance);
    if (!locatorArgs) continue;

    const locator = buildLocator(strategy, locatorArgs, {
      ...affordance,
      accessibleName: args.name ?? affordance.accessibleName,
    });
    if (!locator) continue;

    try {
      const count = await page.locator(locator).count();
      if (count === 1) {
        return { locator, resolvedCount: 1 };
      }
      if (count > 1) {
        // Try scoping to nearest landmark
        const scopedLocator = await scopeToLandmark(locator, page);
        if (scopedLocator) {
          const scopedCount = await page.locator(scopedLocator).count();
          if (scopedCount === 1) {
            return { locator: scopedLocator, resolvedCount: 1 };
          }
        }
      }
    } catch {
      // Continue to next rung
    }
  }
  return null;
}

function buildArgsForStrategy(
  strategy: LocatorStrategy,
  args: LocatorArgs,
  affordance: Affordance,
): LocatorArgs | null {
  const name = args.name ?? affordance.accessibleName;
  const role = args.role ?? affordance.role;

  switch (strategy) {
    case "role_name":
      return role && name ? { role, name } : null;
    case "label":
      return args.label ? { label: args.label } : name ? { label: name } : null;
    case "placeholder":
      return args.placeholder ? { placeholder: args.placeholder } : null;
    case "text":
      return args.text ? { text: args.text } : name ? { text: name } : null;
    case "test_id":
      return args.testId ? { testId: args.testId } : null;
    case "alt_title":
      return args.alt
        ? { alt: args.alt }
        : args.title
          ? { title: args.title }
          : null;
    case "dom_relative":
      return args.selector && args.relativeTo
        ? { selector: args.selector, relativeTo: args.relativeTo }
        : null;
    case "css":
      return args.selector ? { selector: args.selector } : null;
    default:
      return null;
  }
}

async function scopeToLandmark(
  locator: string,
  page: Page,
): Promise<string | null> {
  const landmarks = [
    "main",
    "navigation",
    "banner",
    "contentinfo",
    "complementary",
    "search",
    "region",
  ];
  for (const landmark of landmarks) {
    try {
      const scoped = `getByRole('${landmark}').locator('${locator.replace(/^getByRole\([^)]+\)/, "").trim()}')`;
      const count = await page.locator(scoped).count();
      if (count === 1) return scoped;
    } catch {
      // Continue
    }
  }
  return null;
}

export async function repairAssertion(
  kind: string,
  expected: string,
  actual: string,
  page: Page,
  locator: string | null,
): Promise<string | null> {
  if (!locator) return Promise.resolve(null);
  const normalizedExpected = normalizeForComparison(expected);
  const normalizedActual = normalizeForComparison(actual);

  if (kind === "assertText") {
    if (normalizedExpected === normalizedActual) {
      return Promise.resolve(
        locator
          .replace("toHaveText", "toContainText")
          .replace(expected, normalizedExpected),
      );
    }
    // Check if expected text is in an ancestor
    try {
      const ancestorLocator = `${locator}.locator('..')`;
      const ancestorText = await page.locator(ancestorLocator).textContent();
      if (ancestorText && ancestorText.includes(expected)) {
        return Promise.resolve(
          ancestorLocator.replace("toHaveText", "toContainText"),
        );
      }
    } catch {
      // Ignore
    }
    // No repair for numbers/currency
    if (/\d/.test(expected) || /[$€£¥]/.test(expected)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  }

  if (kind === "assertUrl") {
    const expectedUrl = new URL(expected);
    const actualUrl = new URL(actual);
    // Normalize trailing slash and query order
    const normExpected =
      expectedUrl.pathname.replace(/\/$/, "") +
      "?" +
      [...expectedUrl.searchParams.entries()]
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
    const normActual =
      actualUrl.pathname.replace(/\/$/, "") +
      "?" +
      [...actualUrl.searchParams.entries()]
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
    if (normExpected === normActual) {
      return Promise.resolve(locator.replace(actual, expected));
    }
    return Promise.resolve(null);
  }

  return Promise.resolve(null);
}

function normalizeForComparison(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
