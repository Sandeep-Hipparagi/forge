import type { ElementFingerprint, HealCandidate, HealSignals } from "../schema/index.js";
import { jaccardTokenSet, levenshteinRatio, normalizeLabel } from "../diagnose/text.js";
import { BASE_TRUST } from "./constants.js";

export type RawCandidate = {
  strategy: HealCandidate["strategy"];
  locator: string;
  resolvedCount: number;
  observed: {
    role: string | null;
    accessibleName: string | null;
    text: string | null;
    tagName: string;
    ancestorPath: readonly { tag: string; role: string | null }[];
    siblingIndex: number;
    bbox: { x: number; y: number; w: number; h: number };
  };
};

export type ScoreInput = {
  fingerprint: Pick<
    ElementFingerprint,
    | "intent"
    | "role"
    | "accessibleName"
    | "text"
    | "tagName"
    | "ancestorPath"
    | "siblingIndex"
    | "bbox"
    | "viewport"
  >;
  /** Prior fingerprints for historical signal; empty on first encounter. */
  history?: readonly { accessibleName: string | null; intent: string }[];
};

const COMPATIBLE: ReadonlySet<string> = new Set([
  "button|link",
  "link|button",
  "textbox|searchbox",
  "searchbox|textbox",
  "combobox|listbox",
  "listbox|combobox",
  "checkbox|switch",
  "switch|checkbox",
]);

function semantic(a: string, b: string): number {
  return 0.6 * jaccardTokenSet(a, b) + 0.4 * levenshteinRatio(a, b);
}

function roleScore(fpRole: string | null, candRole: string | null): number {
  if (fpRole === null || candRole === null) return 0;
  if (fpRole === candRole) return 1;
  if (COMPATIBLE.has(`${fpRole}|${candRole}`)) return 0.5;
  const tags = new Set(["button", "input"]);
  if (tags.has(fpRole) && tags.has(candRole)) return 0.3;
  return 0;
}

function textScore(fpText: string | null, candText: string | null): number {
  if ((fpText === null || fpText === "") && (candText === null || candText === "")) return 1;
  return levenshteinRatio(fpText ?? "", candText ?? "");
}

function ancestorSimilarity(
  a: readonly { tag: string; role: string | null }[],
  b: readonly { tag: string; role: string | null }[],
): number {
  const maxDepth = Math.max(a.length, b.length);
  if (maxDepth === 0) return 1;
  let common = 0;
  const limit = Math.min(a.length, b.length);
  for (let i = 1; i <= limit; i++) {
    const left = a[a.length - i]!;
    const right = b[b.length - i]!;
    if (left.tag === right.tag && left.role === right.role) common++;
    else break;
  }
  return common / maxDepth;
}

function siblingProximity(a: number, b: number): number {
  return 1 / (1 + Math.abs(a - b));
}

function iou(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union === 0 ? 0 : inter / union;
}

function centerDistance(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const cxA = a.x + a.w / 2;
  const cyA = a.y + a.h / 2;
  const cxB = b.x + b.w / 2;
  const cyB = b.y + b.h / 2;
  return Math.hypot(cxA - cxB, cyA - cyB);
}

function scoreSignals(input: ScoreInput, raw: RawCandidate): HealSignals {
  const fp = input.fingerprint;
  const obs = raw.observed;
  const anchor = fp.accessibleName ?? fp.intent;
  const observedName = obs.accessibleName ?? obs.text ?? "";

  const sem = semantic(anchor, observedName);
  const role = roleScore(fp.role, obs.role);
  const text = textScore(fp.text, obs.text);
  const domContext =
    0.7 * ancestorSimilarity(fp.ancestorPath, obs.ancestorPath) +
    0.3 * siblingProximity(fp.siblingIndex, obs.siblingIndex);
  const visualGeometry =
    0.6 * iou(fp.bbox, obs.bbox) + 0.4 * Math.exp(-centerDistance(fp.bbox, obs.bbox) / 200);

  const history = input.history ?? [];
  let historical = 0;
  for (const prior of history.slice(-10)) {
    const priorAnchor = prior.accessibleName ?? prior.intent;
    historical = Math.max(historical, semantic(priorAnchor, observedName));
  }

  return {
    semantic: round4(sem),
    role: round4(role),
    text: round4(text),
    domContext: round4(domContext),
    visualGeometry: round4(visualGeometry),
    historical: round4(historical),
  };
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function weightedSum(signals: HealSignals): number {
  return (
    0.3 * signals.semantic +
    0.2 * signals.role +
    0.15 * signals.text +
    0.15 * signals.domContext +
    0.1 * signals.visualGeometry +
    0.1 * signals.historical
  );
}

/**
 * Filter to `resolvedCount === 1` **before** scoring (`I-5`), score, cap by base trust,
 * keep at most 5 unique locators ranked by score ([13 §7–§8](docs/03-algorithms/13-triage-and-healing.md)).
 */
export function scoreCandidates(
  input: ScoreInput,
  raw: readonly RawCandidate[],
  diagnosisId: string,
): Omit<HealCandidate, "id" | "blockedBy">[] {
  const eligible = raw.filter((c) => c.resolvedCount === 1);
  const scored = eligible.map((cand, index) => {
    const signals = scoreSignals(input, cand);
    const rawScore = weightedSum(signals);
    const trust = BASE_TRUST[cand.strategy];
    const score = round4(Math.min(rawScore, trust));
    return {
      diagnosisId,
      rank: index,
      strategy: cand.strategy,
      locator: cand.locator,
      resolvedCount: cand.resolvedCount,
      signals,
      score,
      rationale: `${cand.strategy} · trust ${trust.toFixed(2)} · score ${score.toFixed(3)}`,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.locator.localeCompare(b.locator));
  const seen = new Set<string>();
  const unique: typeof scored = [];
  for (const cand of scored) {
    if (seen.has(cand.locator)) continue;
    seen.add(cand.locator);
    unique.push({ ...cand, rank: unique.length });
    if (unique.length >= 5) break;
  }
  return unique;
}

/** Build a single ladder candidate from fingerprint fields (unit/fixture helper). */
export function ladderCandidate(
  strategy: HealCandidate["strategy"],
  locator: string,
  resolvedCount: number,
  observed: RawCandidate["observed"],
): RawCandidate {
  return { strategy, locator, resolvedCount, observed };
}

export function fingerprintAnchor(fp: ScoreInput["fingerprint"]): string {
  return normalizeLabel(fp.accessibleName ?? fp.intent);
}
