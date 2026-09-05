import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  compile,
  type Capability,
  type CapabilityMap,
  type Lap,
  type LapOutcome,
  type ReportInput,
  type RunContext,
  type Session,
  type SessionEvent,
} from "@forge/core";
import { critiquePlan, planCapability } from "@forge/agent-planner";
import type { ForgeStore } from "@forge/store";
import { closeExplorationBrowser, executeSuite, openExplorationBrowser } from "@forge/runner";
import { exploreSession } from "./explore.js";
import { tg2PrepareMap, tg3OrderBacklog } from "./guards.js";
import { capabilitySubgraph } from "./subgraph.js";

export type LiveSessionOptions = {
  store: ForgeStore;
  context: RunContext;
  sessionId: string;
  repositoryRoot: string;
  /** Max capabilities to lap in one live run. Default 1 for public-site latency. */
  maxLaps?: number;
  headless?: boolean;
  /** Called after each new persisted event so the API EventBus can fan out. */
  onEvent?: (event: SessionEvent) => void;
};

function publish(options: LiveSessionOptions, event: SessionEvent): void {
  options.onEvent?.(event);
}

function commitSession(
  options: LiveSessionOptions,
  patch: Parameters<ForgeStore["commitSessionTransition"]>[1],
  event: Omit<SessionEvent, "seq" | "at">,
): Session {
  const committed = options.store.commitSessionTransition(options.sessionId, patch, event);
  publish(options, committed.event);
  return committed.session;
}

function append(
  options: LiveSessionOptions,
  event: Omit<SessionEvent, "seq" | "at">,
): SessionEvent {
  const written = options.store.appendEvent(event);
  publish(options, written);
  return written;
}

function writeReportInput(repositoryRoot: string, sessionId: string, input: ReportInput): void {
  const path = join(repositoryRoot, "artifacts", "sessions", sessionId, "report-input.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(input, null, 2)}\n`, "utf8");
}

function emptyReport(sessionId: string, context: RunContext, why: string): ReportInput {
  return {
    sessionId,
    reportId: context.ids.next("rpt"),
    generatedAt: context.clock.now().toISOString(),
    scenariosCovered: [],
    outcomes: { passed: 0, failed: 0, healed: 0, flaky: 0, skipped: 0 },
    healerActions: [],
    residualGaps: [
      {
        id: context.ids.next("gap"),
        class: "MISSING_FLOW",
        severity: "MAJOR",
        title: "Live run produced no scenarios",
        why: why.slice(0, 400),
        suggestedScenario: "Re-run live explore against a simpler target",
        affordanceRefs: [],
      },
    ],
    acceptedRisk: [],
    untestedFlowRisk: [],
    defects: [],
    capabilities: [],
    executedSteps: 0,
    flakySteps: 0,
    emittedStrategies: [],
    escalations: 0,
    droppedScenarios: 0,
    acceptedRiskBlockers: 0,
    rolledBackHeals: 0,
  };
}

/**
 * Full live pipeline for one session: explore → prioritise → plan → run → report.
 * Deterministic planner/critic when LLM is off; real Chromium for explore + execute.
 */
export async function runLiveSession(options: LiveSessionOptions): Promise<Session> {
  const session = options.store.getSession(options.sessionId);
  if (session === null) throw new Error(`Session not found: ${options.sessionId}`);

  const maxLaps = Math.max(1, options.maxLaps ?? 1);
  const headless = options.headless ?? true;
  const beforeSeq = options.store.listEvents(options.sessionId).at(-1)?.seq ?? -1;

  try {
    const explored = await exploreSession({
      store: options.store,
      context: options.context,
      sessionId: options.sessionId,
      input: {
        url: session.input.url,
        ...(session.input.username !== undefined ? { username: session.input.username } : {}),
        ...(session.input.intent !== undefined ? { intent: session.input.intent } : {}),
        forceDeterministic: (process.env["FORGE_LLM_ENABLED"] ?? "true") === "false",
        terminal: false,
        headless,
        captureScreenshots: true,
        budgets: {
          maxStates: 30,
          wallClockMs: 120_000,
          politenessDelayMs: 150,
          maxModelCalls: 12,
        },
      },
    });

    for (const event of options.store.listEvents(options.sessionId)) {
      if (event.seq > beforeSeq) publish(options, event);
    }

    const prepared = tg2PrepareMap(explored.map);
    if (!prepared.allowed) {
      throw new Error(prepared.reason);
    }

    let map: CapabilityMap = prepared.value;
    if (prepared.value.capabilities.length !== explored.map.capabilities.length) {
      map = options.store.saveCapabilityMap(prepared.value);
      const last = options.store.listEvents(options.sessionId).at(-1);
      if (last) publish(options, last);
    }

    commitSession(
      options,
      { status: "LAPPING" },
      {
        sessionId: options.sessionId,
        lapId: null,
        actor: "orchestrator",
        type: "capabilities.ranked",
        payload: {
          status: "LAPPING",
          capabilities: map.capabilities.map(({ id, name, priorityRank }) => ({
            id,
            name,
            priorityRank,
          })),
        },
      },
    );

    const backlog = tg3OrderBacklog(map.capabilities).slice(0, maxLaps);
    const report = await runLaps(options, map, backlog);
    writeReportInput(options.repositoryRoot, options.sessionId, report);

    commitSession(
      options,
      { status: "REPORTING" },
      {
        sessionId: options.sessionId,
        lapId: null,
        actor: "reporter",
        type: "report.generated",
        payload: { status: "REPORTING", reportId: report.reportId },
      },
    );

    const defects = report.defects.length;
    return commitSession(
      options,
      {
        status: "COMPLETED",
        exitCode: defects > 0 ? 1 : 0,
        defectsFound: defects,
        finishedAt: options.context.clock.now().toISOString(),
      },
      {
        sessionId: options.sessionId,
        lapId: null,
        actor: "orchestrator",
        type: "session.finished",
        payload: { status: "COMPLETED", exitCode: defects > 0 ? 1 : 0, defects },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live pipeline failed";
    writeReportInput(
      options.repositoryRoot,
      options.sessionId,
      emptyReport(options.sessionId, options.context, message),
    );
    return commitSession(
      options,
      {
        status: "ERROR",
        exitCode: 3,
        finishedAt: options.context.clock.now().toISOString(),
      },
      {
        sessionId: options.sessionId,
        lapId: null,
        actor: "orchestrator",
        type: "session.finished",
        payload: { status: "ERROR", message },
      },
    );
  }
}

async function runLaps(
  options: LiveSessionOptions,
  map: CapabilityMap,
  backlog: Capability[],
): Promise<ReportInput> {
  const scenariosCovered: ReportInput["scenariosCovered"] = [];
  const outcomes = { passed: 0, failed: 0, healed: 0, flaky: 0, skipped: 0 };
  const residualGaps: ReportInput["residualGaps"] = [];
  const acceptedRisk: ReportInput["acceptedRisk"] = [];
  const defects: ReportInput["defects"] = [];
  const capabilityScores: ReportInput["capabilities"] = [];
  const untestedFlowRisk: ReportInput["untestedFlowRisk"] = [];
  let executedSteps = 0;
  const emittedStrategies: Array<
    "role_name" | "test_id" | "text" | "css" | "xpath" | "dom_relative"
  > = [];

  if (backlog.length === 0) {
    return emptyReport(options.sessionId, options.context, "No capabilities discovered to lap");
  }

  for (const [index, capability] of backlog.entries()) {
    const subgraph = capabilitySubgraph(map, capability);
    let lap: Lap = options.store.createLap({
      id: options.context.ids.next("lap"),
      sessionId: options.sessionId,
      capabilityId: capability.id,
      index,
      status: "LAP_PENDING",
      outcome: null,
      replanRounds: 0,
      healAttempts: {},
      acceptedRisk: [],
      specPath: null,
      startedAt: options.context.clock.now().toISOString(),
      bankedAt: null,
    });

    const advance = (
      status: Lap["status"],
      type: SessionEvent["type"],
      extra: Record<string, unknown> = {},
      outcome: LapOutcome | null = null,
    ) => {
      const committed = options.store.commitLapTransition(
        {
          ...lap,
          status,
          outcome: status === "BANKED" ? (outcome ?? "VERIFIED") : lap.outcome,
          bankedAt: status === "BANKED" ? options.context.clock.now().toISOString() : lap.bankedAt,
        },
        {
          sessionId: options.sessionId,
          lapId: lap.id,
          actor: "orchestrator",
          type,
          payload: {
            status,
            outcome: status === "BANKED" ? (outcome ?? "VERIFIED") : null,
            ...extra,
          },
        },
      );
      lap = committed.lap;
      publish(options, committed.event);
    };

    advance("PLANNING", "lap.started", { capabilityId: capability.id, name: capability.name });

    const planned = planCapability({
      subgraph,
      lapId: lap.id,
      capabilityId: capability.id,
      round: 0,
      ctx: options.context,
    });

    advance("CRITIQUING", "plan.drafted", {
      scenarioCount: planned.plan.scenarios.length,
      planId: planned.plan.id,
    });

    const critique = critiquePlan({
      plan: planned.plan,
      subgraph,
      lapId: lap.id,
      replanRounds: lap.replanRounds,
      ctx: options.context,
    });

    residualGaps.push(...critique.residualGaps);
    if (critique.verdict === "ACCEPT_RISK") {
      acceptedRisk.push(...critique.gaps);
    }

    advance("GENERATING", "critique.finished", {
      score: critique.score,
      verdict: critique.verdict,
    });

    const suite = compile(planned.plan, {
      capabilityName: capability.name,
      affordances: subgraph.affordances,
      states: subgraph.states.map((s) => ({ id: s.id, url: s.url })),
      assessmentScore: critique.score,
    });

    for (const scenario of suite.scenarios) {
      scenariosCovered.push({
        scenarioId: scenario.scenarioId,
        capability: capability.name,
        title: scenario.title,
        class: scenario.class,
        priority: scenario.priority,
      });
      for (const step of scenario.steps) {
        const strategy = step.locatorSpec?.strategy;
        if (strategy === "role_name" || strategy === "test_id") {
          emittedStrategies.push(strategy);
        }
      }
    }

    append(options, {
      sessionId: options.sessionId,
      lapId: lap.id,
      actor: "generator",
      type: "generate.validated",
      payload: { scenarioCount: suite.scenarios.length },
    });

    advance("RUNNING", "run.started", { scenarioCount: suite.scenarios.length });

    const opened = await openExplorationBrowser({ headless: options.headless ?? true });
    let lapOutcome: LapOutcome = "VERIFIED";

    if (!opened.ok) {
      lapOutcome = "LAP_FAILED";
      defects.push({
        diagnosisId: options.context.ids.next("diag"),
        capability: capability.name,
        expected: "browser launch",
        actual: opened.error.message,
        severity: "BLOCKER",
      });
      outcomes.failed += Math.max(1, suite.scenarios.length);
    } else {
      try {
        const entryUrl =
          subgraph.states.find((s) => s.id === subgraph.entryStateId)?.url ??
          map.states[0]?.url ??
          options.store.getSession(options.sessionId)!.input.url;
        await opened.data.page
          .goto(entryUrl, { waitUntil: "domcontentloaded" })
          .catch(() => undefined);

        const run = await executeSuite(suite, opened.data.page, {
          onEvidence: async (row) => {
            const shot = options.store.putEvidence({
              sessionId: options.sessionId,
              lapId: lap.id,
              runId: null,
              stepId: row.stepId,
              type: "SCREENSHOT",
              label: `${row.scenarioId}:${row.stepId}`,
              content: row.screenshot,
              metadata: { url: opened.data.page.url() },
            });
            options.store.putEvidence({
              sessionId: options.sessionId,
              lapId: lap.id,
              runId: null,
              stepId: row.stepId,
              type: "DOM",
              label: `${row.scenarioId}:${row.stepId}:dom`,
              content: row.dom,
              metadata: {},
            });
            append(options, {
              sessionId: options.sessionId,
              lapId: lap.id,
              actor: "runner",
              type: "evidence.captured",
              payload: {
                evidenceId: shot.id,
                stepId: row.stepId,
                scenarioId: row.scenarioId,
                kind: "SCREENSHOT",
              },
            });
            executedSteps += 1;
          },
        });

        if (!run.ok) {
          lapOutcome = "LAP_FAILED";
          outcomes.failed += Math.max(1, suite.scenarios.length);
          defects.push({
            diagnosisId: options.context.ids.next("diag"),
            capability: capability.name,
            expected: "suite execution",
            actual: run.error.message,
            severity: "BLOCKER",
          });
        } else {
          for (const scenario of run.data.scenarios) {
            if (scenario.status === "VERIFIED") {
              outcomes.passed += 1;
            } else {
              outcomes.failed += 1;
              lapOutcome = "DEFECT_FOUND";
              defects.push({
                diagnosisId: options.context.ids.next("diag"),
                capability: capability.name,
                expected: "scenario verified",
                actual: (scenario.errorMessage ?? "FAIL_WITH_EVIDENCE").slice(0, 300),
                severity: "MAJOR",
              });
            }
          }
        }
      } finally {
        await closeExplorationBrowser(opened.data);
      }
    }

    advance("BANKED", "lap.banked", { outcome: lapOutcome }, lapOutcome);

    const classes = new Set(suite.scenarios.map((s) => s.class));
    capabilityScores.push({
      capabilityId: capability.id,
      name: capability.name,
      finalScore: critique.score,
      hasAllFourClasses: classes.size >= 4,
      residualGaps: critique.residualGaps,
      acceptedRisk: critique.verdict === "ACCEPT_RISK" ? critique.gaps : [],
    });
  }

  for (const capability of map.capabilities) {
    if (backlog.some((c) => c.id === capability.id)) continue;
    untestedFlowRisk.push({
      capabilityId: capability.id,
      name: capability.name,
      riskScore: capability.risk.score,
      why: "Not reached in this live run (capability budget)",
      factors: capability.risk.factors,
    });
    capabilityScores.push({
      capabilityId: capability.id,
      name: capability.name,
      finalScore: null,
      hasAllFourClasses: false,
      residualGaps: [],
      acceptedRisk: [],
    });
  }

  return {
    sessionId: options.sessionId,
    reportId: options.context.ids.next("rpt"),
    generatedAt: options.context.clock.now().toISOString(),
    scenariosCovered,
    outcomes,
    healerActions: [],
    residualGaps,
    acceptedRisk,
    untestedFlowRisk,
    defects,
    capabilities: capabilityScores,
    executedSteps,
    flakySteps: 0,
    emittedStrategies,
    escalations: 0,
    droppedScenarios: 0,
    acceptedRiskBlockers: acceptedRisk.filter((g) => g.severity === "BLOCKER").length,
    rolledBackHeals: 0,
  };
}
