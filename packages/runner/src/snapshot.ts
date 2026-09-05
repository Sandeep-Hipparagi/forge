import type { AccessibilityNode, AccessibilitySnapshot, DomFacts } from "@forge/perception";
import type { Page } from "playwright";
import { fail, ok, type ToolResult } from "./result.js";

type AriaJsonNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  disabled?: boolean;
  level?: number;
  children?: Array<AriaJsonNode | string>;
};

function toAccessibilityNode(node: AriaJsonNode): AccessibilityNode {
  const children = (node.children ?? [])
    .filter((child): child is AriaJsonNode => typeof child !== "string")
    .filter((child) => child.role !== "text")
    .map(toAccessibilityNode);

  const result: AccessibilityNode = {
    role: node.role,
    name: node.name ?? null,
  };
  if (node.ref !== undefined) result.ref = node.ref;
  if (node.disabled !== undefined) result.disabled = node.disabled;
  if (node.level !== undefined) result.level = node.level;
  if (children.length > 0) result.children = children;
  return result;
}

function collectRefs(node: AccessibilityNode, into: string[]): void {
  if (node.ref) into.push(node.ref);
  if (node.children) {
    for (const child of node.children) collectRefs(child, into);
  }
}

/**
 * Capture an AccessibilitySnapshot + DomFacts from a live Playwright page.
 * Uses `ariaSnapshotJSON({ mode: "ai" })` so refs are stamped and actionable
 * via `aria-ref=<ref>` locators (ADR-016).
 */
export async function captureSnapshot(
  page: Page,
): Promise<ToolResult<{ snapshot: AccessibilitySnapshot; dom: DomFacts }>> {
  const started = performance.now();
  try {
    const raw = (await page.ariaSnapshotJSON({ mode: "ai" })) as AriaJsonNode[];
    const root: AccessibilityNode =
      raw.length === 1
        ? toAccessibilityNode(raw[0]!)
        : {
            role: "WebArea",
            name: null,
            children: raw.map(toAccessibilityNode),
          };

    const snapshot: AccessibilitySnapshot = {
      url: page.url(),
      title: await page.title(),
      root,
    };

    const refs: string[] = [];
    collectRefs(root, refs);

    const inputs: DomFacts["inputs"] = {};
    for (const ref of refs) {
      const locator = page.locator(`aria-ref=${ref}`);
      const count = await locator.count();
      if (count !== 1) continue;
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
      if (tag !== "input" && tag !== "textarea" && tag !== "select") continue;
      const facts = await locator.evaluate((el) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        return {
          type: "type" in input ? input.type : "text",
          autocomplete: input.getAttribute("autocomplete"),
          name: input.getAttribute("name"),
          id: input.id || null,
          placeholder: input.getAttribute("placeholder"),
        };
      });
      inputs[ref] = facts;
    }

    const dom: DomFacts = { inputs };
    return ok({ snapshot, dom }, performance.now() - started);
  } catch (error) {
    return fail(
      "SCRIPT_ERROR",
      error instanceof Error ? error.message : "snapshot capture failed",
      performance.now() - started,
    );
  }
}
