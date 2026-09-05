import type { HealCandidate } from "../schema/index.js";

export const BASE_TRUST: Record<HealCandidate["strategy"], number> = {
  role_name: 1.0,
  test_id: 0.95,
  label: 0.9,
  placeholder: 0.85,
  text: 0.8,
  alt_title: 0.75,
  dom_relative: 0.65,
  css: 0.45,
  geometry: 0.35,
  xpath: 0.2,
};

export const FAIL_GATE = 0.65;
export const AUTO_HEAL_GATE = 0.85;
export const AMBIGUITY_MARGIN = 0.05;

export const HEALING_LADDER: readonly HealCandidate["strategy"][] = [
  "role_name",
  "test_id",
  "label",
  "placeholder",
  "text",
  "alt_title",
  "dom_relative",
  "css",
  "geometry",
  "xpath",
];

/** Exploration deny-list is broader; this list is healing-only ([13 §10](docs/03-algorithms/13-triage-and-healing.md)). */
export const DESTRUCTIVE_HEAL =
  /\b(delete|remove|cancel|void|refund|discard|revoke|terminate|destroy|clear|reset|unsubscribe|close account)\b/i;
