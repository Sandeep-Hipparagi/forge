import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export async function runReset(repositoryRoot: string): Promise<number> {
  const artifacts = join(repositoryRoot, "artifacts");
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });

  const fixturePlans = join(repositoryRoot, "fixtures", "plans");
  const generatedSuites = join(repositoryRoot, "tests", "generated");
  rmSync(generatedSuites, { recursive: true, force: true });
  if (existsSync(fixturePlans)) {
    cpSync(fixturePlans, generatedSuites, { recursive: true });
  }

  const fixtureSeed = join(repositoryRoot, "fixtures", "sut", "seed.json");
  const sutSeed = join(repositoryRoot, "apps", "sut", "state", "seed.json");
  if (existsSync(fixtureSeed)) {
    mkdirSync(join(repositoryRoot, "apps", "sut", "state"), { recursive: true });
    cpSync(fixtureSeed, sutSeed);
  }

  const controlUrl = process.env.SUT_CONTROL_URL;
  if (controlUrl !== undefined && controlUrl !== "") {
    try {
      const response = await fetch(`${controlUrl.replace(/\/$/, "")}/__forge/reset`, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        console.error(`forge reset: SUT control returned ${response.status}`);
        return 3;
      }
    } catch (error) {
      console.error(`forge reset: ${error instanceof Error ? error.message : "SUT reset failed"}`);
      return 3;
    }
  }

  console.log("FORGE reset complete");
  return 0;
}
