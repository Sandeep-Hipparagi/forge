import type { CompiledScenario, CompiledStep, CompiledSuite, LocatorSpec } from "@forge/core";
import type { Locator, Page } from "playwright";
import { fail, ok, type ToolResult } from "./result.js";

export type StepEvidence = {
  stepId: string;
  scenarioId: string;
  dom: string;
  screenshot: Buffer;
};

export type ScenarioRunResult = {
  scenarioId: string;
  status: "VERIFIED" | "FAIL_WITH_EVIDENCE";
  evidence: StepEvidence[];
  errorMessage?: string;
};

export type SuiteRunResult = {
  scenarios: ScenarioRunResult[];
  healAttempts: number;
};

export type ExecuteOptions = {
  /** Invoked after each successful step with DOM + screenshot (FR-507 minimum). */
  onEvidence?: (evidence: StepEvidence) => void | Promise<void>;
  /** Optional secrets to redact from captured DOM before handing to onEvidence. */
  secrets?: readonly string[];
};

/**
 * Execute a compiled suite against a live Playwright page.
 * Sprint scope: DOM + screenshot evidence only; healAttempts always 0.
 */
export async function executeSuite(
  suite: CompiledSuite,
  page: Page,
  options: ExecuteOptions = {},
): Promise<ToolResult<SuiteRunResult>> {
  const started = performance.now();
  const scenarios: ScenarioRunResult[] = [];
  const evidenceIds: string[] = [];

  for (const scenario of suite.scenarios) {
    const result = await runScenario(scenario, page, options);
    scenarios.push(result);
    if (result.status !== "VERIFIED") {
      return ok({ scenarios, healAttempts: 0 }, performance.now() - started, evidenceIds);
    }
  }
  return ok({ scenarios, healAttempts: 0 }, performance.now() - started, evidenceIds);
}

async function runScenario(
  scenario: CompiledScenario,
  page: Page,
  options: ExecuteOptions,
): Promise<ScenarioRunResult> {
  const evidence: StepEvidence[] = [];
  for (const step of scenario.steps) {
    const performed = await performStep(page, step);
    if (!performed.ok) {
      return {
        scenarioId: scenario.scenarioId,
        status: "FAIL_WITH_EVIDENCE",
        evidence,
        errorMessage: performed.error.message,
      };
    }
    const row = await captureEvidence(
      page,
      scenario.scenarioId,
      step.stepId,
      options.secrets ?? [],
    );
    evidence.push(row);
    await options.onEvidence?.(row);
  }
  return { scenarioId: scenario.scenarioId, status: "VERIFIED", evidence };
}

async function performStep(page: Page, step: CompiledStep): Promise<ToolResult<void>> {
  const started = performance.now();

  if (step.kind === "navigate") {
    const path = step.locatorSpec?.strategy === "goto" ? step.locatorSpec.path : "/";
    const current = page.url();
    // Fixture runs often preload the page; resolve relative paths against the origin.
    if (current === "about:blank" || current.startsWith("data:")) {
      return ok(undefined, performance.now() - started);
    }
    const target = new URL(path, current).href;
    if (current !== target) {
      try {
        await page.goto(target);
      } catch (error) {
        return fail(
          "NAVIGATION_FAILED",
          error instanceof Error ? error.message : String(error),
          performance.now() - started,
        );
      }
    }
    return ok(undefined, performance.now() - started);
  }

  const locator = step.locatorSpec ? toLocator(page, step.locatorSpec) : null;

  try {
    switch (step.kind) {
      case "click": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.click();
        return ok(undefined, performance.now() - started);
      }
      case "fill": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.fill(resolveInput(step.input));
        return ok(undefined, performance.now() - started);
      }
      case "select": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.selectOption(resolveInput(step.input));
        return ok(undefined, performance.now() - started);
      }
      case "press": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.press(resolveInput(step.input ?? "Enter"));
        return ok(undefined, performance.now() - started);
      }
      case "hover": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.hover();
        return ok(undefined, performance.now() - started);
      }
      case "waitFor":
      case "assertVisible": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        await locator.waitFor({ state: "visible" });
        return ok(undefined, performance.now() - started);
      }
      case "assertText": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        const text = await locator.innerText();
        const expected = resolveInput(step.input);
        if (!text.includes(expected)) {
          return fail(
            "ASSERTION_FAILED",
            `assertText failed: expected to contain ${JSON.stringify(expected)}`,
            performance.now() - started,
          );
        }
        return ok(undefined, performance.now() - started);
      }
      case "assertUrl": {
        const current = page.url();
        const needle = step.input ?? "";
        if (needle && !current.includes(needle) && !new RegExp(needle).test(current)) {
          return fail(
            "ASSERTION_FAILED",
            `assertUrl failed: ${current} !~ ${needle}`,
            performance.now() - started,
          );
        }
        return ok(undefined, performance.now() - started);
      }
      case "assertCount": {
        if (!locator) {
          return fail(
            "LOCATOR_NOT_FOUND",
            `Missing locator for ${step.stepId}`,
            performance.now() - started,
          );
        }
        const n = Number.parseInt(step.input ?? "1", 10);
        const count = await locator.count();
        if (count !== n) {
          return fail(
            "ASSERTION_FAILED",
            `assertCount failed: expected ${n}, got ${count}`,
            performance.now() - started,
          );
        }
        return ok(undefined, performance.now() - started);
      }
      default:
        return ok(undefined, performance.now() - started);
    }
  } catch (error) {
    return fail(
      "SCRIPT_ERROR",
      error instanceof Error ? error.message : String(error),
      performance.now() - started,
    );
  }
}

function toLocator(page: Page, spec: LocatorSpec): Locator | null {
  switch (spec.strategy) {
    case "role_name":
      return page.getByRole(spec.role as Parameters<Page["getByRole"]>[0], { name: spec.name });
    case "role":
      return page.getByRole(spec.role as Parameters<Page["getByRole"]>[0]);
    case "test_id":
      return page.getByTestId(spec.testId);
    case "goto":
      return null;
  }
}

function resolveInput(input: string | null): string {
  if (input === null) return "";
  const env = /^\$([A-Z][A-Z0-9_]*)$/.exec(input);
  if (env) return process.env[env[1]!] ?? "";
  return input;
}

async function captureEvidence(
  page: Page,
  scenarioId: string,
  stepId: string,
  secrets: readonly string[],
): Promise<StepEvidence> {
  let dom = await page.content();
  for (const secret of secrets.filter(Boolean)) {
    dom = dom.replaceAll(secret, "[REDACTED]");
  }
  const screenshot = await page.screenshot({ type: "png", fullPage: true });
  return { stepId, scenarioId, dom, screenshot };
}
