import crypto from "node:crypto";
import type { AccessibilityNode, AccessibilitySnapshot, SnapshotAffordance } from "./types.js";

/**
 * Destructive verb deny-list used during exploration.
 * Kept in sync with the wording in 08 · Perception Layer.
 */
export const DESTRUCTIVE =
  /\b(delete|remove|cancel|void|refund|discard|revoke|terminate|destroy|clear|reset|deactivate|unsubscribe|pay|transfer|submit order|place order|close account)\b/i;

const LANDMARK_ROLES = new Set([
  "banner",
  "main",
  "contentinfo",
  "navigation",
  "form",
  "region",
  "complementary",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "submit",
]);

function normaliseRoute(urlString: string): string {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return urlString;
  }
  const normalisedPath = url.pathname
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (/^[0-9]+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        return ":id";
      }
      return segment;
    })
    .join("/");

  const params = [...url.searchParams.keys()]
    .sort()
    .map((key) => `${key}=:v`)
    .join("&");

  return params ? `${normalisedPath}?${params}` : normalisedPath;
}

function maskDigits(value: string | null): string | null {
  if (value == null) return null;
  return value.replace(/[0-9]+/g, "#");
}

type CanonicalNode = {
  role: string;
  name: string | null;
  children: CanonicalNode[];
};

function isStructural(node: AccessibilityNode): boolean {
  return LANDMARK_ROLES.has(node.role) || node.role === "heading";
}

function isInteractive(node: AccessibilityNode): boolean {
  return Boolean(node.ref && (INTERACTIVE_ROLES.has(node.role) || !!node.href));
}

function shouldKeep(node: AccessibilityNode): boolean {
  return isStructural(node) || isInteractive(node);
}

function toCanonicalTree(node: AccessibilityNode): CanonicalNode | null {
  if (!shouldKeep(node) && !node.children?.length) return null;

  const children: CanonicalNode[] = [];
  if (node.children) {
    const seen = new Set<string>();
    for (const child of node.children) {
      const canonicalChild = toCanonicalTree(child);
      if (!canonicalChild) continue;
      const key = `${canonicalChild.role}:${canonicalChild.name ?? ""}:${canonicalChild.children.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      children.push(canonicalChild);
    }
  }

  const name =
    isInteractive(node) || node.role === "heading" ? maskDigits(node.name ?? null) : null;

  if (!shouldKeep(node) && !children.length) return null;

  return {
    role: node.role,
    name,
    children,
  };
}

function canonicalToString(node: CanonicalNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const name = node.name ?? "";
  const line = `${indent}${node.role}:${name}`;
  if (!node.children.length) return line;
  const children = node.children.map((child) => canonicalToString(child, depth + 1)).join("\n");
  return `${line}\n${children}`;
}

/**
 * Compute a 16-hex character state signature from an accessibility snapshot.
 * The algorithm follows 08 §3: route normalisation, structural filtering,
 * sibling collapse, digit masking, then SHA-256 over the canonical skeleton.
 */
export function stateSignature(snapshot: AccessibilitySnapshot): string {
  const route = normaliseRoute(snapshot.url);
  const canonical = toCanonicalTree(snapshot.root);
  const skeleton = canonical ? canonicalToString(canonical) : "";
  const payload = `${route}\n${skeleton}`;
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return hash.slice(0, 16);
}

function mapAffordanceKind(role: string): SnapshotAffordance["kind"] {
  switch (role) {
    case "button":
    case "switch":
    case "slider":
      return "button";
    case "link":
      return "link";
    case "textbox":
      return "textbox";
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "combobox":
    case "listbox":
      return "select";
    case "tab":
      return "tab";
    case "menuitem":
      return "menuitem";
    case "form":
      return "form";
    default:
      return "other";
  }
}

/**
 * Extract deterministic affordances from a snapshot. Every interactive
 * node becomes one affordance with deny-list flags applied; nothing here
 * depends on a model or on persisted ids.
 */
export function affordancesOf(snapshot: AccessibilitySnapshot): SnapshotAffordance[] {
  const results: SnapshotAffordance[] = [];

  function visit(node: AccessibilityNode): void {
    const isInteractiveNode = isInteractive(node);
    if (isInteractiveNode && node.ref) {
      const accessibleName = node.name ?? null;
      const destructive = Boolean(accessibleName && DESTRUCTIVE.test(accessibleName));
      const enabled = node.disabled === true ? false : true;
      results.push({
        ref: node.ref,
        role: node.role,
        accessibleName,
        kind: mapAffordanceKind(node.role),
        enabled,
        bbox: null,
        destructive,
        observedNotExercised: false,
        notExercisedReason: null,
      });
    }
    if (node.children) {
      for (const child of node.children) visit(child);
    }
  }

  visit(snapshot.root);
  return results;
}
