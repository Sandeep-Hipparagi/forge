import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type EvalOptions = {
  tier: "replay" | "live";
  caseId?: string | undefined;
  repeat: number;
  coverage: boolean;
};

/**
 * Ph0 stub of the golden-case harness (16 · Agent Test Suite).
 * `fixtures/golden/**` is empty until Ph1.6 builds real cases, so the run is
 * vacuously green — every one of zero cases matched its expected verdict.
 * The real orchestrator-driven harness replaces this in Ph1.6.
 */
export function runEval(repoRoot: string, options: EvalOptions): number {
  const goldenDir = join(repoRoot, "fixtures", "golden");
  const caseFiles = existsSync(goldenDir)
    ? readdirSync(goldenDir).filter((f: string) => f.endsWith(".json"))
    : [];

  const selected = options.caseId
    ? caseFiles.filter((f: string) => f === `${options.caseId}.json`)
    : caseFiles;

  if (options.caseId && selected.length === 0) {
    console.error(`forge eval: no such case '${options.caseId}' in ${goldenDir}`);
    return 3;
  }

  console.log(
    `FORGE EVAL · ${selected.length} case(s) · ${options.tier} · repeat ${options.repeat}`,
  );
  for (const file of selected) {
    console.log(`  ${file}  (not yet implemented — Ph1.6)`);
  }
  console.log(`\n${selected.length}/${selected.length} · exit 0`);
  return 0;
}
