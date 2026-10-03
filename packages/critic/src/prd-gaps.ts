import type { CoverageAssessment } from "./types.js";

export type PrdGap = CoverageAssessment["prdGaps"][number];

export interface PrdRequirement {
  text: string;
  sectionRef: string;
  severity: "INFO" | "MINOR" | "MAJOR" | "BLOCKER";
}

export function extractPrdRequirements(prdText: string): PrdRequirement[] {
  const sections = splitPrdSections(prdText);
  const requirements: PrdRequirement[] = [];

  for (const section of sections) {
    const sentences = splitSentences(section.content);
    for (const sentence of sentences) {
      const severity = requirementSeverity(sentence);
      if (severity) {
        requirements.push({
          text: sentence.trim(),
          sectionRef: section.ref,
          severity,
        });
      }
    }
  }

  return requirements;
}

function splitPrdSections(
  text: string,
): Array<{ ref: string; content: string }> {
  const lines = text.split("\n");
  const sections: Array<{ ref: string; content: string }> = [];
  let currentRef = "§1";
  let currentContent = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentContent.trim()) {
        sections.push({ ref: currentRef, content: currentContent.trim() });
      }
      const level = headingMatch[1]?.length ?? 1;
      const title = headingMatch[2] ?? "";
      currentRef = `§${level}.${title}`;
      currentContent = "";
    } else {
      currentContent += line + "\n";
    }
  }
  if (currentContent.trim()) {
    sections.push({ ref: currentRef, content: currentContent.trim() });
  }

  return sections.length > 0 ? sections : [{ ref: "§1", content: text }];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

function requirementSeverity(
  sentence: string,
): "BLOCKER" | "MAJOR" | "MINOR" | null {
  const lower = sentence.toLowerCase();

  const blockerVerbs = [
    "must",
    "shall",
    "is required to",
    "cannot",
    "must not",
  ];
  const majorVerbs = ["should", "is expected to", "is required to"];
  const minorVerbs = ["may", "can optionally", "might"];

  if (blockerVerbs.some((v) => lower.includes(v))) return "BLOCKER";
  if (majorVerbs.some((v) => lower.includes(v))) return "MAJOR";
  if (minorVerbs.some((v) => lower.includes(v))) return "MINOR";

  return null;
}

export function matchRequirementsToPlan(
  requirements: PrdRequirement[],
  plan: {
    scenarios: Array<{ id: string; title: string; expectedOutcome: string }>;
  },
): Array<{
  requirement: PrdRequirement;
  coveredBy?: string;
  verified: boolean;
}> {
  const results: Array<{
    requirement: PrdRequirement;
    coveredBy?: string;
    verified: boolean;
  }> = [];

  for (const req of requirements) {
    let bestMatch: { scenarioId: string; overlap: number } | null = null;

    for (const scenario of plan.scenarios) {
      const haystack = (
        scenario.title +
        " " +
        scenario.expectedOutcome
      ).toLowerCase();
      const reqTokens = new Set(
        req.text.toLowerCase().split(/\W+/).filter(Boolean),
      );
      const hayTokens = new Set(haystack.split(/\W+/).filter(Boolean));

      const intersection = [...reqTokens].filter((t) =>
        hayTokens.has(t),
      ).length;
      const union = reqTokens.size + hayTokens.size - intersection;
      const overlap = union > 0 ? intersection / union : 0;

      if (overlap >= 0.3 && (!bestMatch || overlap > bestMatch.overlap)) {
        bestMatch = { scenarioId: scenario.id, overlap };
      }
    }

    if (bestMatch) {
      results.push({
        requirement: req,
        coveredBy: bestMatch.scenarioId,
        verified: true,
      });
    } else {
      results.push({
        requirement: req,
        verified: false,
      });
    }
  }

  return results;
}

export function buildPrdGaps(
  requirements: PrdRequirement[],
  matches: Array<{
    requirement: PrdRequirement;
    coveredBy?: string;
    verified: boolean;
  }>,
  cap = 15,
): PrdGap[] {
  const gaps: PrdGap[] = [];

  for (const match of matches) {
    if (!match.verified) {
      gaps.push({
        requirement: match.requirement.text,
        prdSectionRef: match.requirement.sectionRef,
        severity: match.requirement.severity,
      });
    }
  }

  const sevOrder: Record<string, number> = {
    BLOCKER: 0,
    MAJOR: 1,
    MINOR: 2,
    INFO: 3,
  };
  return gaps
    .sort((a, b) => {
      return (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99);
    })
    .slice(0, cap);
}
