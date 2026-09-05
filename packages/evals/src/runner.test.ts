import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evalExitCode, runCases, type CaseResult } from "./runner.js";

describe("eval runner", () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("drives a stub case through the real API and matches its terminal verdict", async () => {
    directory = await mkdtemp(join(tmpdir(), "forge-eval-"));
    const golden = join(directory, "fixtures", "golden");
    await mkdir(golden, { recursive: true });
    await writeFile(
      join(golden, "PH1-SPINE.json"),
      JSON.stringify({
        id: "PH1-SPINE",
        title: "Phase 1 spine",
        seed: 20260905,
        given: {
          reset: true,
          session: { url: "http://phase1.stub/" },
        },
        expect: {
          session: { status: "COMPLETED", exitCode: 0, defectsFound: 0 },
        },
        requirements: ["FR-903"],
      }),
    );

    const results = await runCases(directory, {
      tier: "replay",
      repeat: 2,
      coverage: false,
    });
    expect(results).toMatchObject([
      {
        id: "PH1-SPINE",
        matched: true,
        verdict: { session: { status: "COMPLETED", exitCode: 0 } },
      },
    ]);
    expect(evalExitCode(results)).toBe(0);
  });

  it("returns zero when matched cases legitimately have session exit 1 or 2", () => {
    const result = (id: string, exitCode: 1 | 2): CaseResult => ({
      id,
      title: id,
      matched: true,
      verdict: {
        session: { status: exitCode === 1 ? "COMPLETED" : "ESCALATED", exitCode, defectsFound: 1 },
        backlog: [],
        laps: [],
      },
    });
    expect(evalExitCode([result("defect", 1), result("escalation", 2)])).toBe(0);
  });

  it("returns three when any case mismatches", () => {
    expect(evalExitCode([{ id: "bad", title: "bad", matched: false, verdict: null }])).toBe(3);
  });
});
