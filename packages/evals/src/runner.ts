import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildForgeServer } from "@forge/api";
import type { RunContext, SessionStatus } from "@forge/core";
import { ForgeStore } from "@forge/store";
import { z } from "zod";

const CaseFile = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  seed: z.number().int(),
  given: z.object({
    reset: z.literal(true),
    session: z.object({
      url: z.string().url(),
      username: z.string().optional(),
      password: z.string().optional(),
      intent: z.string().optional(),
      mode: z.enum(["autopilot", "copilot"]).optional(),
      budget: z
        .object({
          maxCapabilities: z.number().int().positive().optional(),
          maxDurationMs: z.number().int().positive().optional(),
          maxUsd: z.number().positive().optional(),
        })
        .optional(),
    }),
  }),
  expect: z.object({
    session: z.object({
      status: z.enum(["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"]),
      exitCode: z.number().int().min(0).max(3),
      defectsFound: z.number().int().nonnegative(),
    }),
  }),
  requirements: z.array(z.string()).default([]),
});

export type CaseFile = z.infer<typeof CaseFile>;

export type EvalOptions = {
  tier: "replay" | "live";
  caseId?: string | undefined;
  repeat: number;
  coverage: boolean;
};

export type Verdict = {
  session: {
    status: SessionStatus;
    exitCode: number | null;
    defectsFound: number;
  };
  backlog: string[];
  laps: Array<{ capabilityId: string; outcome: string | null }>;
};

export type CaseResult = {
  id: string;
  title: string;
  matched: boolean;
  verdict: Verdict | null;
  error?: string;
};

export function loadCases(repositoryRoot: string, caseId?: string): CaseFile[] {
  const directory = join(repositoryRoot, "fixtures", "golden");
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const selected = caseId === undefined ? files : files.filter((file) => file === `${caseId}.json`);
  if (caseId !== undefined && selected.length === 0) {
    throw new Error(`No such eval case: ${caseId}`);
  }
  return selected.map((file) =>
    CaseFile.parse(JSON.parse(readFileSync(join(directory, file), "utf8")) as unknown),
  );
}

function seededContext(seed: number): RunContext {
  let state = seed >>> 0;
  let sequence = 0;
  const nextRandom = (): number => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  return {
    clock: {
      now: () => new globalThis.Date(1_767_225_600_000 + sequence),
      monotonicMs: () => sequence,
    },
    rng: { next: nextRandom },
    ids: {
      next: (prefix) =>
        `${prefix}_${(sequence++).toString(36).padStart(8, "0")}${Math.floor(nextRandom() * 0xffff)
          .toString(36)
          .padStart(4, "0")}`,
    },
  };
}

async function executeCase(
  repositoryRoot: string,
  testCase: CaseFile,
  repeatIndex: number,
): Promise<Verdict> {
  const context = seededContext(testCase.seed);
  const runDirectory = join(repositoryRoot, "artifacts", "evals", `${testCase.id}-${repeatIndex}`);
  rmSync(runDirectory, { recursive: true, force: true });
  mkdirSync(runDirectory, { recursive: true });
  const store = new ForgeStore({
    databasePath: join(runDirectory, "forge.db"),
    repositoryRoot,
    context,
  });
  const target = new URL(testCase.given.session.url);
  const app = buildForgeServer({
    store,
    context,
    allowedHosts: [target.hostname],
  });

  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: testCase.given.session,
    });
    if (created.statusCode !== 201) {
      throw new Error(`POST /api/sessions returned ${created.statusCode}: ${created.body}`);
    }
    const sessionId = created.json<{ id: string }>().id;
    let status: SessionStatus = "CREATED";
    for (let attempt = 0; attempt < 100 && !isTerminal(status); attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${sessionId}`,
      });
      status = response.json<{ status: SessionStatus }>().status;
    }
    const session = store.getSession(sessionId);
    if (session === null || !isTerminal(session.status)) {
      throw new Error(`Session did not reach a terminal status; last=${session?.status}`);
    }
    return {
      session: {
        status: session.status,
        exitCode: session.exitCode,
        defectsFound: session.defectsFound,
      },
      backlog: store.listCapabilities(sessionId).map(({ name }) => name),
      laps: store
        .listLaps(sessionId)
        .map(({ capabilityId, outcome }) => ({ capabilityId, outcome })),
    };
  } finally {
    await app.close();
    store.close();
  }
}

function isTerminal(status: SessionStatus): boolean {
  return (
    status === "COMPLETED" ||
    status === "COMPLETED_PARTIAL" ||
    status === "ESCALATED" ||
    status === "ERROR"
  );
}

export function matchedExpectedSession(
  actual: Verdict["session"],
  expected: CaseFile["expect"]["session"],
): boolean {
  return (
    actual.status === expected.status &&
    actual.exitCode === expected.exitCode &&
    actual.defectsFound === expected.defectsFound
  );
}

export function evalExitCode(results: readonly CaseResult[]): 0 | 3 {
  return results.every(({ matched }) => matched) ? 0 : 3;
}

export async function runCases(
  repositoryRoot: string,
  options: EvalOptions,
): Promise<CaseResult[]> {
  const cases = loadCases(repositoryRoot, options.caseId);
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    try {
      const verdicts: Verdict[] = [];
      for (let index = 0; index < options.repeat; index += 1) {
        verdicts.push(await executeCase(repositoryRoot, testCase, index));
      }
      const deterministic = verdicts.every(
        (verdict) => JSON.stringify(verdict) === JSON.stringify(verdicts[0]),
      );
      const verdict = verdicts[0] ?? null;
      results.push({
        id: testCase.id,
        title: testCase.title,
        matched:
          deterministic &&
          verdict !== null &&
          matchedExpectedSession(verdict.session, testCase.expect.session),
        verdict,
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        title: testCase.title,
        matched: false,
        verdict: null,
        error: error instanceof Error ? error.message : "Unknown eval failure",
      });
    }
  }

  const reportDirectory = join(repositoryRoot, "artifacts", "evals");
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(
    join(reportDirectory, "latest-report.json"),
    `${JSON.stringify({ tier: options.tier, results }, null, 2)}\n`,
  );
  return results;
}
