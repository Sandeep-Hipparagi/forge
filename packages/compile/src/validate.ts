import type {
  CompiledSuite,
  CompiledStep,
  ValidatedSuite,
  ValidatedScenario,
  ValidatedStep,
  ElementFingerprint,
  ValidationContext,
} from "./types.js";
import { repairAssertion } from "./locator.js";
import { expect, type Page } from "@playwright/test";

export async function validate(
  suite: CompiledSuite,
  context: ValidationContext,
): Promise<{
  suite: ValidatedSuite;
  droppedScenarios: Array<{ scenarioId: string; reason: string }>;
}> {
  const { page, storageState } = context;
  const droppedScenarios: Array<{ scenarioId: string; reason: string }> = [];
  const validatedScenarios: ValidatedScenario[] = [];

  for (const scenario of suite.scenarios) {
    const validatedSteps: ValidatedStep[] = [];
    let scenarioDropped = false;

    // Create isolated context for this scenario
    const browser = page.context().browser();
    const scenarioContext = browser
      ? await browser.newContext({ storageState: JSON.parse(storageState) })
      : page.context();
    const scenarioPage = await scenarioContext.newPage();
    await scenarioPage.setViewportSize({ width: 1440, height: 900 });

    try {
      for (const step of scenario.steps) {
        let resolvedCount: number | null = null;
        let fingerprint: ElementFingerprint | null = null;

        if (
          ["click", "fill", "select", "press", "hover", "navigate"].includes(
            step.kind,
          )
        ) {
          // Resolve locator with ladder
          if (step.locator) {
            try {
              const count = await scenarioPage.locator(step.locator).count();
              if (count === 1) {
                resolvedCount = 1;
              } else if (count > 1) {
                // Try scoping
                const scoped = await scopeToLandmark(
                  step.locator,
                  scenarioPage,
                );
                if (scoped) {
                  const scopedCount = await scenarioPage
                    .locator(scoped)
                    .count();
                  if (scopedCount === 1) {
                    step.locator = scoped;
                    resolvedCount = 1;
                  }
                }
                if (resolvedCount !== 1) {
                  droppedScenarios.push({
                    scenarioId: scenario.id,
                    reason: `AMBIGUOUS_LOCATOR: step ${step.id}`,
                  });
                  scenarioDropped = true;
                  break;
                }
              } else if (count === 0) {
                droppedScenarios.push({
                  scenarioId: scenario.id,
                  reason: `LOCATOR_BROKEN: step ${step.id}`,
                });
                scenarioDropped = true;
                break;
              }
            } catch {
              droppedScenarios.push({
                scenarioId: scenario.id,
                reason: `LOCATOR_ERROR: step ${step.id}`,
              });
              scenarioDropped = true;
              break;
            }

            // Capture fingerprint on successful resolution
            if (resolvedCount === 1) {
              fingerprint = await captureFingerprint(
                scenarioPage,
                step.locator,
                step,
                scenario.id,
              );
            }
          } else {
            // No locator (e.g., navigate) - just perform action
            resolvedCount = 1;
          }

          // Perform the action
          await performAction(scenarioPage, step, step.locator);
        } else if (
          ["assertText", "assertVisible", "assertUrl", "assertCount"].includes(
            step.kind,
          )
        ) {
          // Execute assertion with repair
          try {
            await executeAssertion(scenarioPage, step, step.locator);
          } catch {
            // Try repair
            const repaired = await repairAssertion(
              step.kind,
              step.input ?? "",
              "",
              scenarioPage,
              step.locator,
            );
            if (repaired) {
              // Retry with repaired assertion
              await executeAssertion(scenarioPage, step, repaired);
            } else {
              droppedScenarios.push({
                scenarioId: scenario.id,
                reason: `ASSERTION_FAILED: step ${step.id}`,
              });
              scenarioDropped = true;
              break;
            }
          }
        }

        validatedSteps.push({
          ...step,
          resolvedCount: resolvedCount ?? 0,
          fingerprint: fingerprint ?? undefined,
        } as ValidatedStep);
      }

      if (!scenarioDropped) {
        validatedScenarios.push({
          ...scenario,
          steps: validatedSteps,
        });
      }
    } finally {
      await scenarioContext.close();
    }

    if (scenarioDropped) continue;
  }

  const validatedSuite: ValidatedSuite = {
    ...suite,
    scenarios: validatedScenarios,
  };

  return { suite: validatedSuite, droppedScenarios };
}

async function performAction(
  page: Page,
  step: CompiledStep,
  locator: string | null,
): Promise<void> {
  switch (step.kind) {
    case "navigate":
      await page.goto(step.targetIntent, {
        waitUntil: "domcontentloaded",
        timeout: step.timeoutMs,
      });
      break;
    case "click":
      await page.locator(locator!).click({ timeout: step.timeoutMs });
      break;
    case "fill":
      await page
        .locator(locator!)
        .fill(step.input ?? "", { timeout: step.timeoutMs });
      break;
    case "select":
      await page
        .locator(locator!)
        .selectOption(step.input ?? "", { timeout: step.timeoutMs });
      break;
    case "press":
      await page
        .locator(locator!)
        .press(step.input ?? "", { timeout: step.timeoutMs });
      break;
    case "hover":
      await page.locator(locator!).hover({ timeout: step.timeoutMs });
      break;
  }
}

async function executeAssertion(
  page: Page,
  step: CompiledStep,
  locator: string | null,
): Promise<void> {
  switch (step.kind) {
    case "assertText":
      await expect(page.locator(locator!)).toHaveText(step.input ?? "", {
        timeout: step.timeoutMs,
      });
      break;
    case "assertVisible":
      await expect(page.locator(locator!)).toBeVisible({
        timeout: step.timeoutMs,
      });
      break;
    case "assertUrl":
      await page.waitForURL(step.input ?? "", { timeout: step.timeoutMs });
      break;
    case "assertCount": {
      const expected = Number.parseInt(step.input ?? "1", 10);
      await page
        .locator(locator!)
        .waitFor({ state: "attached", timeout: step.timeoutMs });
      const actual = await page.locator(locator!).count();
      if (actual !== expected) {
        throw new Error(
          `Expected ${expected} matching elements, found ${actual}`,
        );
      }
      break;
    }
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

async function captureFingerprint(
  page: Page,
  locator: string,
  step: CompiledStep,
  scenarioId: string,
): Promise<ElementFingerprint> {
  const element = page.locator(locator).first();
  const handle = await element.elementHandle();
  if (!handle) throw new Error("Element not found");

  const attrs = await handle.evaluate((el: Element) => {
    const allowed = [
      "type",
      "name",
      "placeholder",
      "aria-label",
      "aria-labelledby",
      "title",
      "alt",
      "href",
      "value",
      "role",
      "data-testid",
      "data-test",
      "data-qa",
    ];
    const result: Record<string, string> = {};
    for (const attr of allowed) {
      const val = el.getAttribute(attr);
      if (val) result[attr] = val;
    }
    return result;
  });

  const computedStyle = await handle.evaluate((el: Element) => {
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      display: cs.display,
      visibility: cs.visibility,
    };
  });

  const bbox = await handle.boundingBox();
  const viewportSize = page.viewportSize();
  const viewport = {
    width: viewportSize?.width ?? 1440,
    height: viewportSize?.height ?? 900,
    deviceScaleFactor: 1,
  };

  // Ancestor path (max 6)
  const ancestorPath = await handle.evaluate((el: Element) => {
    const path = [];
    let current: Element | null = el.parentElement;
    for (let i = 0; i < 6 && current; i++) {
      path.push({
        tag: current.tagName.toLowerCase(),
        role: current.getAttribute("role"),
        id: current.id || null,
      });
      current = current.parentElement;
    }
    return path;
  });

  const siblingIndex = await handle.evaluate((el: Element) => {
    let index = 0;
    let sibling = el.previousElementSibling;
    while (sibling) {
      index++;
      sibling = sibling.previousElementSibling;
    }
    return index;
  });

  return {
    id: `fp_${scenarioId}_${step.id}`,
    scenarioId,
    stepId: step.id,
    capturedInRunId: "run_validation",
    capturedAt: "1970-01-01T00:00:00.000Z",
    intent: step.targetIntent,
    role: step.kind === "navigate" ? null : "button",
    accessibleName: null,
    text: null,
    tagName: "",
    testId: null,
    attributes: attrs,
    ancestorPath,
    siblingIndex,
    bbox: bbox
      ? { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height }
      : { x: 0, y: 0, w: 0, h: 0 },
    viewport,
    screenshotCropEvidenceId: null,
    computedStyle,
  };
}
