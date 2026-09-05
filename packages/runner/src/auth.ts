import {
  detectLoginForm,
  stateSignature,
  type AccessibilitySnapshot,
  type DomFacts,
  type LoginForm,
} from "@forge/perception";
import type { Browser, BrowserContext, Page } from "playwright";
import { fail, ok, type ToolResult } from "./result.js";
import { captureSnapshot } from "./snapshot.js";

export type Credentials = {
  username: string;
  password: string;
};

export type AuthReason =
  | "NO_CREDENTIALS"
  | "NO_LOGIN_FORM"
  | "LOW_CONFIDENCE"
  | "CREDENTIALS_REJECTED"
  | "NO_CHANGE"
  | "OFF_ORIGIN"
  | "AUTHENTICATED";

export type AuthOutcome =
  | {
      status: "authenticated";
      reason: "AUTHENTICATED";
      form: LoginForm;
      loginAttempts: number;
    }
  | {
      status: "unauthenticated";
      reason: Exclude<AuthReason, "AUTHENTICATED">;
      form: LoginForm | null;
      loginAttempts: number;
    };

const POST_AUTH_AFFORDANCE = /\b(sign ?out|log ?out|my account|profile)\b/i;
const CONFIDENCE_FLOOR = 0.6;

function hasPasswordInput(dom: DomFacts): boolean {
  return Object.values(dom.inputs).some(
    (facts) => (facts?.type ?? "").toLowerCase() === "password",
  );
}

function hasPostAuthAffordance(snapshot: AccessibilitySnapshot): boolean {
  function walk(node: { role: string; name: string | null; children?: (typeof node)[] }): boolean {
    if (node.name && POST_AUTH_AFFORDANCE.test(node.name)) return true;
    return (node.children ?? []).some(walk);
  }
  return walk(snapshot.root);
}

function hasAlertOrStatus(snapshot: AccessibilitySnapshot): boolean {
  function walk(node: { role: string; children?: (typeof node)[] }): boolean {
    if (node.role === "alert" || node.role === "status") return true;
    return (node.children ?? []).some(walk);
  }
  return walk(snapshot.root);
}

/**
 * Structural auth verdict from 09 §2.2 — signature change plus either the
 * password field vanishing or a post-auth affordance appearing.
 */
export function isAuthenticated(
  before: AccessibilitySnapshot,
  after: AccessibilitySnapshot,
  afterDom: DomFacts,
): boolean {
  if (stateSignature(before) === stateSignature(after)) return false;
  if (!hasPasswordInput(afterDom)) return true;
  return hasPostAuthAffordance(after);
}

async function fillRef(page: Page, ref: string, value: string): Promise<ToolResult<void>> {
  const started = performance.now();
  try {
    const locator = page.locator(`aria-ref=${ref}`);
    const count = await locator.count();
    if (count === 0) {
      return fail("LOCATOR_NOT_FOUND", `ref ${ref} not found`, performance.now() - started);
    }
    if (count > 1) {
      return fail("LOCATOR_AMBIGUOUS", `ref ${ref} matched ${count}`, performance.now() - started);
    }
    await locator.fill(value);
    return ok(undefined, performance.now() - started);
  } catch (error) {
    return fail(
      "ELEMENT_NOT_INTERACTABLE",
      error instanceof Error ? error.message : "fill failed",
      performance.now() - started,
    );
  }
}

async function clickRef(page: Page, ref: string): Promise<ToolResult<void>> {
  const started = performance.now();
  try {
    const locator = page.locator(`aria-ref=${ref}`);
    const count = await locator.count();
    if (count === 0) {
      return fail("LOCATOR_NOT_FOUND", `ref ${ref} not found`, performance.now() - started);
    }
    if (count > 1) {
      return fail("LOCATOR_AMBIGUOUS", `ref ${ref} matched ${count}`, performance.now() - started);
    }
    await locator.click();
    return ok(undefined, performance.now() - started);
  } catch (error) {
    return fail(
      "ELEMENT_NOT_INTERACTABLE",
      error instanceof Error ? error.message : "click failed",
      performance.now() - started,
    );
  }
}

function sameOrigin(entryUrl: string, currentUrl: string): boolean {
  try {
    return new URL(entryUrl).origin === new URL(currentUrl).origin;
  } catch {
    return true;
  }
}

async function submitOnce(
  page: Page,
  form: LoginForm,
  credentials: Credentials,
  viaEnter: boolean,
): Promise<ToolResult<void>> {
  const fillIdentity = await fillRef(page, form.identityRef, credentials.username);
  if (!fillIdentity.ok) return fillIdentity;
  const fillPassword = await fillRef(page, form.passwordRef, credentials.password);
  if (!fillPassword.ok) return fillPassword;

  if (viaEnter) {
    const started = performance.now();
    try {
      await page.locator(`aria-ref=${form.passwordRef}`).press("Enter");
      return ok(undefined, performance.now() - started);
    } catch (error) {
      return fail(
        "ELEMENT_NOT_INTERACTABLE",
        error instanceof Error ? error.message : "press Enter failed",
        performance.now() - started,
      );
    }
  }
  return clickRef(page, form.submitRef);
}

/**
 * Detect a login form on a live page, submit credentials at most twice
 * (click, then Enter / retry), and return a structural auth verdict.
 * Does not persist storageState — callers pass `context.storageState()`
 * into `ForgeStore.ensureStorageState` once on success (FR-102).
 */
export async function loginOnce(
  page: Page,
  credentials: Credentials,
  options: { entryUrl?: string } = {},
): Promise<ToolResult<AuthOutcome>> {
  const started = performance.now();
  const entryUrl = options.entryUrl ?? page.url();
  let loginAttempts = 0;

  const beforeCapture = await captureSnapshot(page);
  if (!beforeCapture.ok) {
    return fail(beforeCapture.error.code, beforeCapture.error.message, performance.now() - started);
  }
  const { snapshot: before, dom: beforeDom } = beforeCapture.data;

  const form = detectLoginForm(before, beforeDom);
  if (form === null) {
    return ok(
      {
        status: "unauthenticated",
        reason: "NO_LOGIN_FORM",
        form: null,
        loginAttempts,
      },
      performance.now() - started,
    );
  }
  if (form.confidence < CONFIDENCE_FLOOR) {
    return ok(
      {
        status: "unauthenticated",
        reason: "LOW_CONFIDENCE",
        form,
        loginAttempts,
      },
      performance.now() - started,
    );
  }

  const attempts: Array<{ viaEnter: boolean }> = [{ viaEnter: false }, { viaEnter: true }];

  for (const attempt of attempts) {
    loginAttempts += 1;
    // Re-capture before each retry so refs stay valid after a DOM mutate.
    const attemptBefore = loginAttempts === 1 ? beforeCapture : await captureSnapshot(page);
    if (!attemptBefore.ok) {
      return fail(
        attemptBefore.error.code,
        attemptBefore.error.message,
        performance.now() - started,
      );
    }
    const attemptForm =
      loginAttempts === 1
        ? form
        : detectLoginForm(attemptBefore.data.snapshot, attemptBefore.data.dom);
    if (attemptForm === null || attemptForm.confidence < CONFIDENCE_FLOOR) {
      break;
    }

    const submitted = await submitOnce(page, attemptForm, credentials, attempt.viaEnter);
    if (!submitted.ok) {
      return fail(submitted.error.code, submitted.error.message, performance.now() - started);
    }

    await page.waitForLoadState("domcontentloaded").catch(() => undefined);

    if (!sameOrigin(entryUrl, page.url())) {
      return ok(
        {
          status: "unauthenticated",
          reason: "OFF_ORIGIN",
          form: attemptForm,
          loginAttempts,
        },
        performance.now() - started,
      );
    }

    const afterCapture = await captureSnapshot(page);
    if (!afterCapture.ok) {
      return fail(afterCapture.error.code, afterCapture.error.message, performance.now() - started);
    }
    const { snapshot: after, dom: afterDom } = afterCapture.data;

    if (isAuthenticated(attemptBefore.data.snapshot, after, afterDom)) {
      return ok(
        {
          status: "authenticated",
          reason: "AUTHENTICATED",
          form: attemptForm,
          loginAttempts,
        },
        performance.now() - started,
      );
    }

    const signatureChanged = stateSignature(attemptBefore.data.snapshot) !== stateSignature(after);
    if (signatureChanged && hasPasswordInput(afterDom) && hasAlertOrStatus(after)) {
      // Credentials rejected — retry once, then give up (09 §2.2).
      continue;
    }
    // Signature unchanged → retry via Enter, then give up.
  }

  const finalReason: AuthOutcome["reason"] =
    loginAttempts > 0 ? "CREDENTIALS_REJECTED" : "NO_CHANGE";

  return ok(
    {
      status: "unauthenticated",
      reason: finalReason === "CREDENTIALS_REJECTED" ? "CREDENTIALS_REJECTED" : "NO_CHANGE",
      form,
      loginAttempts,
    },
    performance.now() - started,
  );
}

export type ExplorationBrowser = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

/**
 * Open a Chromium context, optionally seeded with a previously persisted
 * storageState so the crawl never logs in twice (FR-102).
 */
export async function openExplorationBrowser(
  options: {
    storageStatePath?: string | null;
    headless?: boolean;
  } = {},
): Promise<ToolResult<ExplorationBrowser>> {
  const started = performance.now();
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: options.headless ?? true });
    const contextOptions =
      options.storageStatePath != null && options.storageStatePath !== ""
        ? { storageState: options.storageStatePath }
        : {};
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    return ok({ browser, context, page }, performance.now() - started);
  } catch (error) {
    return fail(
      "INTERNAL",
      error instanceof Error ? error.message : "failed to launch browser",
      performance.now() - started,
    );
  }
}

export async function closeExplorationBrowser(
  handle: ExplorationBrowser,
): Promise<ToolResult<void>> {
  const started = performance.now();
  try {
    await handle.context.close();
    await handle.browser.close();
    return ok(undefined, performance.now() - started);
  } catch (error) {
    return fail(
      "INTERNAL",
      error instanceof Error ? error.message : "failed to close browser",
      performance.now() - started,
    );
  }
}
