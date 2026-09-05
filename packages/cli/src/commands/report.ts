import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildReport, demoReportInput, renderMarkdown, type ReportInput } from "@forge/core";

/**
 * `forge report <sessionId>` — re-render from stored rows or the demo fixture.
 */
export async function runReport(sessionId: string | undefined, repoRoot: string): Promise<number> {
  if (sessionId === undefined || sessionId.length === 0) {
    console.error("forge report: sessionId is required");
    return 1;
  }

  const sessionDir = join(repoRoot, "artifacts", "sessions", sessionId);
  const inputPath = join(sessionDir, "report-input.json");

  let input: ReportInput;
  if (existsSync(inputPath)) {
    input = JSON.parse(readFileSync(inputPath, "utf8")) as ReportInput;
  } else {
    input = demoReportInput(sessionId);
    console.error(
      `forge report: no ${inputPath}; using demo fixture so the five mandated sections still print.`,
    );
  }

  const report = buildReport(input);
  const markdown = renderMarkdown(report);

  mkdirSync(sessionDir, { recursive: true });
  const mdPath = join(sessionDir, "report.md");
  const jsonPath = join(sessionDir, "report.json");
  writeFileSync(mdPath, markdown, "utf8");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log(markdown);
  console.error(`\nWrote ${mdPath}`);
  return 0;
}
