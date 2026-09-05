import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildForgeServer } from "@forge/api";
import type { CapabilityMap, RunContext, SessionStatus } from "@forge/core";
import { exploreSession, rankCapabilities } from "@forge/orchestrator";
import { ForgeStore } from "@forge/store";
import { z } from "zod";
import { createEc02FixturePorts } from "./ec02-fixture.js";

const ExploreExpect = z
  .object({
    choiceSource: z.enum(["deterministic", "llm"]),
    modelCalls: z.number().int().nonnegative(),
    haltReason: z.enum(["EXHAUSTED", "STATE_BUDGET", "TIME_BUDGET", "CALL_BUDGET"]),
    minCapabilities: z.number().int().positive().optional(),
    minStates: z.number().int().positive().optional(),
    productVariantsCollapsed: z.boolean().optional(),
    denyListObserved: z.boolean().optional(),
  })
  .optional();

const CaseFile = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  seed: z.number().int(),
  mode: z.enum(["session", "explore"]).default("session"),
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
    env: z.record(z.string()).optional(),
  }),
  expect: z.object({
    session: z.object({
      status: z.enum(["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"]),
      exitCode: z.number().int().min(0).max(3),
      defectsFound: z.number().int().nonnegative(),
    }),
    explore: ExploreExpect,
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
  explore?: {
    choiceSource: "deterministic" | "llm";
    modelCalls: number;
    haltReason: CapabilityMap["frontier"]["haltReason"];
    capabilities: number;
    states: number;
    productVariantsCollapsed: boolean;
    denyListObserved: boolean;
    rankingStable: boolean;
  };
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

function seededContext(seed: number): RunContext & {
  clock: RunContext["clock"] & { advance(ms: number): void };
} {
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
      advance: (ms: number) => {
        sequence += ms;
      },
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

function withEnv(
  env: Record<string, string> | undefined,
  run: () => Promise<Verdict>,
): Promise<Verdict> {
  if (env === undefined) return run();
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  // EC-02 also requires the API key unset.
  if (env["FORGE_LLM_ENABLED"] === "false") {
    previous.set("ANTHROPIC_API_KEY", process.env["ANTHROPIC_API_KEY"]);
    delete process.env["ANTHROPIC_API_KEY"];
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function executeExploreCase(
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

  try {
    const result = await exploreSession({
      store,
      context,
      input: {
        url: testCase.given.session.url,
        ...(testCase.given.session.username !== undefined
          ? { username: testCase.given.session.username }
          : {}),
        ...(testCase.given.session.password !== undefined
          ? { password: testCase.given.session.password }
          : {}),
        ...(testCase.given.session.intent !== undefined
          ? { intent: testCase.given.session.intent }
          : {}),
        forceDeterministic: true,
        terminal: true,
        driver: createEc02FixturePorts(context.clock, context.ids),
      },
    });

    const productState = result.map.states.find((state) => state.signature === "product000000000");
    const denyListObserved = result.map.affordances.some(
      (affordance) =>
        affordance.destructive &&
        affordance.observedNotExercised &&
        /place order/i.test(affordance.accessibleName ?? ""),
    );

    const orders: string[][] = [];
    for (let i = 0; i < 5; i += 1) {
      orders.push(rankCapabilities(result.map).map(({ name }) => name));
    }
    const rankingStable = orders.every(
      (order) => JSON.stringify(order) === JSON.stringify(orders[0]),
    );

    return {
      session: {
        status: result.session.status,
        exitCode: result.session.exitCode,
        defectsFound: result.session.defectsFound,
      },
      backlog: result.map.capabilities.map(({ name }) => name),
      laps: [],
      explore: {
        choiceSource: result.choiceSource,
        modelCalls: result.modelCalls,
        haltReason: result.map.frontier.haltReason,
        capabilities: result.map.capabilities.length,
        states: result.map.states.length,
        productVariantsCollapsed: (productState?.visitedVariants ?? 0) >= 3,
        denyListObserved,
        rankingStable,
      },
    };
  } finally {
    store.close();
  }
}

async function executeSessionCase(
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

async function executeCase(
  repositoryRoot: string,
  testCase: CaseFile,
  repeatIndex: number,
): Promise<Verdict> {
  return withEnv(testCase.given.env, async () => {
    if (testCase.mode === "explore") {
      return executeExploreCase(repositoryRoot, testCase, repeatIndex);
    }
    return executeSessionCase(repositoryRoot, testCase, repeatIndex);
  });
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

export function matchedExploreExpect(
  actual: Verdict["explore"] | undefined,
  expected: CaseFile["expect"]["explore"],
): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  if (actual.choiceSource !== expected.choiceSource) return false;
  if (actual.modelCalls !== expected.modelCalls) return false;
  if (actual.haltReason !== expected.haltReason) return false;
  if (expected.minCapabilities !== undefined && actual.capabilities < expected.minCapabilities) {
    return false;
  }
  if (expected.minStates !== undefined && actual.states < expected.minStates) return false;
  if (expected.productVariantsCollapsed === true && !actual.productVariantsCollapsed) return false;
  if (expected.denyListObserved === true && !actual.denyListObserved) return false;
  if (!actual.rankingStable) return false;
  return true;
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
          matchedExpectedSession(verdict.session, testCase.expect.session) &&
          matchedExploreExpect(verdict.explore, testCase.expect.explore),
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
