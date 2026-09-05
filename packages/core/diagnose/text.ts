const STOPWORDS = new Set(["the", "a", "an", "to", "your"]);

/** Lowercase, strip punctuation, collapse whitespace, drop stopwords. */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .join(" ");
}

/** Tokens that are purely numeric or currency-shaped. */
const NUMERIC_OR_CURRENCY = /^[\d₹$€£¥,.]+$/u;

/**
 * True when non-numeric parts of expected/actual are identical
 * and at least one numeric/currency token differs (V3 / row 2).
 */
export function numericOnlyDelta(expected: string, actual: string): boolean {
  const split = (s: string): { numeric: string[]; other: string[] } => {
    const tokens = normalizeLabel(s).split(/\s+/).filter(Boolean);
    const numeric: string[] = [];
    const other: string[] = [];
    for (const token of tokens) {
      if (NUMERIC_OR_CURRENCY.test(token) || /\d/.test(token)) {
        numeric.push(token.replace(/,/g, ""));
      } else {
        other.push(token);
      }
    }
    return { numeric, other };
  };

  const a = split(expected);
  const b = split(actual);
  if (a.other.join(" ") !== b.other.join(" ")) return false;
  if (a.numeric.length === 0 && b.numeric.length === 0) return false;
  return a.numeric.join("|") !== b.numeric.join("|");
}

export function jaccardTokenSet(a: string, b: string): number {
  const setA = new Set(normalizeLabel(a).split(/\s+/).filter(Boolean));
  const setB = new Set(normalizeLabel(b).split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function levenshteinRatio(a: string, b: string): number {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (left.length === 0 && right.length === 0) return 1;
  const dist = levenshtein(left, right);
  const maxLen = Math.max(left.length, right.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i]![0] = i;
  for (let j = 0; j < cols; j++) matrix[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[a.length]![b.length]!;
}

/** Deterministic 16-char hex fingerprint — no node:crypto (core purity). */
export function failureSignature(parts: readonly string[]): string {
  const input = parts.join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (c << (i % 16));
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  return hex.slice(0, 16);
}

export function stripVolatile(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/['"`]/g, "")
    .replace(/\b\d+\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
