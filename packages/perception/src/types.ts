import type { BBox } from "@forge/core";

/**
 * Minimal representation of an accessibility snapshot used by the
 * perception layer. This is intentionally smaller than Playwright's
 * full tree – it keeps only the information our pure functions need.
 */
export interface AccessibilityNode {
  role: string;
  /**
   * Accessible name for this node, when present.
   */
  name: string | null;
  /**
   * Snapshot-local stable identifier for interactive elements.
   * Matches the `e42` style refs used throughout the docs.
   */
  ref?: string;
  /**
   * ARIA level for headings, when present.
   */
  level?: number | null;
  /**
   * Whether this node is disabled / not actionable.
   */
  disabled?: boolean | null;
  /**
   * Raw HTML attributes we need for detection heuristics.
   * These are keyed by ref via `DomFacts.inputs`.
   */
  autocomplete?: string | null;
  nameAttribute?: string | null;
  idAttribute?: string | null;
  placeholder?: string | null;
  inputType?: string | null;
  href?: string | null;
  children?: AccessibilityNode[];
}

export interface AccessibilitySnapshot {
  url: string;
  title: string | null;
  /**
   * Root of the ARIA tree.
   */
  root: AccessibilityNode;
  /**
   * Count of interactive elements observed when the snapshot was taken.
   * This is used for budget assertions, not for the algorithms themselves.
   */
  interactiveCount?: number;
  /**
   * Approximate raw DOM size in bytes for the underlying page.
   */
  rawDomBytes?: number;
}

/**
 * DOM facts keyed by snapshot ref, used primarily by login detection.
 */
export interface DomInputFacts {
  type: string | null;
  autocomplete?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
}

export interface DomFacts {
  inputs: Record<string, DomInputFacts | undefined>;
}

/**
 * A perception-layer affordance: the atomic "thing a user could do"
 * extracted from a snapshot. This is intentionally the subset of the
 * domain `Affordance` shape that does not depend on persisted ids.
 */
export interface SnapshotAffordance {
  ref: string;
  role: string;
  accessibleName: string | null;
  kind:
    | "button"
    | "link"
    | "textbox"
    | "checkbox"
    | "radio"
    | "select"
    | "tab"
    | "menuitem"
    | "form"
    | "upload"
    | "other";
  enabled: boolean;
  bbox: BBox | null;
  destructive: boolean;
  observedNotExercised: boolean;
  notExercisedReason: string | null;
}
