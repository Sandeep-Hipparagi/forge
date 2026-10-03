import type { CoverageAssessment, LapState, Gap } from "./types.js";

export function verdict(
  assessment: CoverageAssessment,
  lap: LapState,
): "PASS" | "REPLAN" | "ACCEPT_RISK" {
  const blocked = assessment.gaps.some((g) => g.severity === "BLOCKER");
  if (!blocked && assessment.score >= assessment.floor) return "PASS";
  if (lap.replanRounds < lap.maxReplanRounds) return "REPLAN";
  return "ACCEPT_RISK";
}

export function mergeGaps(
  structuralGaps: Gap[],
  semanticGaps: Gap[],
  cap = 12,
): Gap[] {
  const allGaps: Gap[] = [
    ...structuralGaps,
    ...semanticGaps.map((g) => ({ ...g, severity: clampSeverity(g.severity) })),
  ];

  const deduped = deduplicateGaps(allGaps);
  const sevOrder: Record<string, number> = {
    BLOCKER: 0,
    MAJOR: 1,
    MINOR: 2,
    INFO: 3,
  };
  const sorted = deduped.sort((a, b) => {
    const aSev = sevOrder[a.severity] ?? 99;
    const bSev = sevOrder[b.severity] ?? 99;
    if (aSev !== bSev) {
      return aSev - bSev;
    }
    if (a.class !== b.class) return a.class.localeCompare(b.class);
    return a.title.localeCompare(b.title);
  });

  return sorted.slice(0, cap);
}

function clampSeverity(
  severity: string,
): "INFO" | "MINOR" | "MAJOR" | "BLOCKER" {
  if (severity === "BLOCKER") return "MAJOR";
  return severity as "INFO" | "MINOR" | "MAJOR";
}

function deduplicateGaps(gaps: Gap[]): Gap[] {
  const seen = new Map<string, Gap>();

  for (const gap of gaps) {
    const key = `${gap.class}:${gap.title.toLowerCase().replace(/[^\w]+/g, "_")}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, gap);
    } else {
      const sevOrder: Record<string, number> = {
        BLOCKER: 0,
        MAJOR: 1,
        MINOR: 2,
        INFO: 3,
      };
      if (
        (sevOrder[gap.severity] ?? 99) < (sevOrder[existing.severity] ?? 99)
      ) {
        seen.set(key, gap);
      }
    }
  }

  return Array.from(seen.values());
}
