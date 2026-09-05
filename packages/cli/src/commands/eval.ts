import { evalExitCode, loadCases, runCases, type EvalOptions } from "@forge/evals";

export async function runEval(repoRoot: string, options: EvalOptions): Promise<number> {
  let cases;
  try {
    cases = loadCases(repoRoot, options.caseId);
  } catch (error) {
    console.error(`forge eval: ${error instanceof Error ? error.message : "load failed"}`);
    return 3;
  }
  console.log(`FORGE EVAL · ${cases.length} case(s) · ${options.tier} · repeat ${options.repeat}`);
  const results = await runCases(repoRoot, options);
  for (const result of results) {
    const session = result.verdict?.session;
    console.log(
      `  ${result.id}  ${result.title}  ${session?.status ?? "FAILED"}  exit ${
        session?.exitCode ?? "-"
      }  ${result.matched ? "✓" : "✗"}`,
    );
    if (result.error !== undefined) console.error(`    ${result.error}`);
  }
  const exitCode = evalExitCode(results);
  console.log(
    `\n${results.filter(({ matched }) => matched).length}/${results.length} · exit ${exitCode}`,
  );
  return exitCode;
}
