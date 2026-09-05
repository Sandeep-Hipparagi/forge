import type { Session, SessionStatus, SessionEvent } from "@forge/core";
import { exitCodeFor } from "./guards.js";

interface LapRecord {
  id: string;
  sessionId: string;
  [key: string]: unknown;
}

interface ReportRecord {
  id: string;
  sessionId: string;
  [key: string]: unknown;
}

export interface SessionStore {
  sessions: Map<string, Session>;
  createSession(session: Session): void;
  updateSession(session: Session): void;
  getEvents(sessionId: string, since?: number): SessionEvent[];
  appendEvent(event: Omit<SessionEvent, "seq">): SessionEvent;
  getEvidence?(sessionId: string): unknown[];
  createLap?(lap: LapRecord): void;
  getLap?(id: string): LapRecord | undefined;
  getLapsBySession?(sessionId: string): LapRecord[];
  createReport?(report: ReportRecord): void;
  getReportBySession?(sessionId: string): ReportRecord | undefined;
}

const terminal = new Set<SessionStatus>([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);
export const isTerminal = (status: SessionStatus): boolean =>
  terminal.has(status);

export const runSession = async (
  store: SessionStore,
  sessionId: string,
): Promise<Session> => {
  let session = store.sessions.get(sessionId);
  if (!session) throw new Error("unknown session");

  session = { ...session, status: "EXPLORING" };
  store.updateSession(session);
  store.appendEvent({
    id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
    eventVersion: 1,
    sessionId,
    lapId: null,
    at: session.createdAt,
    actor: "orchestrator",
    type: "explore.state",
    payload: { status: "EXPLORING" },
    evidenceIds: [],
    traceId: `tr_${sessionId}`,
    spanId: "sp_exploring",
    configSha256: session.configSha256,
  });

  try {
    const { runExplorerAgent } = await import("@forge/agents");
    const { defaultSessionConfig } = await import("@forge/core");

    const explorerInput = {
      url: session.input.url,
      credentials: session.input.username && session.input.password
        ? { username: session.input.username, password: session.input.password }
        : undefined,
      intent: session.input.intent,
      budgets: {
        maxStates: session.config.exploration.maxStates ?? 40,
        maxDurationMs: session.config.budget.maxDurationMs ?? 90_000,
        maxCalls: session.config.budget.maxCalls ?? 40,
        maxTurns: session.config.budget.maxTurns ?? 8,
      },
    };

    const explorerResult = await runExplorerAgent(explorerInput);

    const capabilityMap = explorerResult.capabilityMap;

    session = { ...session, status: "PRIORITISING" };
    store.updateSession(session);
    store.appendEvent({
      id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
      eventVersion: 1,
      sessionId,
      lapId: null,
      at: new Date().toISOString(),
      actor: "orchestrator",
      type: "capabilities.ranked",
      payload: { status: "PRIORITISING", capabilities: capabilityMap.capabilities.length },
      evidenceIds: [],
      traceId: `tr_${sessionId}`,
      spanId: "sp_prioritising",
      configSha256: session.configSha256,
    });

    session = { ...session, status: "LAPPING" };
    store.updateSession(session);
    store.appendEvent({
      id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
      eventVersion: 1,
      sessionId,
      lapId: null,
      at: new Date().toISOString(),
      actor: "orchestrator",
      type: "lap.started",
      payload: { status: "LAPPING" },
      evidenceIds: [],
      traceId: `tr_${sessionId}`,
      spanId: "sp_lapping",
      configSha256: session.configSha256,
    });

    session = { ...session, status: "REPORTING" };
    store.updateSession(session);
    store.appendEvent({
      id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
      eventVersion: 1,
      sessionId,
      lapId: null,
      at: new Date().toISOString(),
      actor: "orchestrator",
      type: "report.generated",
      payload: { status: "REPORTING" },
      evidenceIds: [],
      traceId: `tr_${sessionId}`,
      spanId: "sp_reporting",
      configSha256: session.configSha256,
    });
  } catch (error) {
    session = {
      ...session,
      status: "ERROR",
      finishedAt: new Date().toISOString(),
      exitCode: 3,
    };
    store.updateSession(session);
    store.appendEvent({
      id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
      eventVersion: 1,
      sessionId,
      lapId: null,
      at: new Date().toISOString(),
      actor: "orchestrator",
      type: "session.finished",
      payload: { status: "ERROR", exitCode: 3, error: error instanceof Error ? error.message : String(error) },
      evidenceIds: [],
      traceId: `tr_${sessionId}`,
      spanId: "sp_error",
      configSha256: session.configSha256,
    });
    return session;
  }

  session = {
    ...session,
    status: "COMPLETED",
    finishedAt: new Date().toISOString(),
    exitCode: exitCodeFor("COMPLETED", session.defectsFound),
  };
  store.updateSession(session);
  store.appendEvent({
    id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
    eventVersion: 1,
    sessionId,
    lapId: null,
    at: session.createdAt,
    actor: "orchestrator",
    type: "session.finished",
    payload: { status: session.status, exitCode: session.exitCode },
    evidenceIds: [],
    traceId: `tr_${sessionId}`,
    spanId: "sp_finished",
    configSha256: session.configSha256,
  });
  return session;
};

export const runStubSession = async (
  store: SessionStore,
  sessionId: string,
): Promise<Session> => {
  let session = store.sessions.get(sessionId);
  if (!session) throw new Error("unknown session");
  for (const status of [
    "EXPLORING",
    "PRIORITISING",
    "LAPPING",
    "REPORTING",
  ] as const) {
    session = { ...session, status };
    store.updateSession(session);
    store.appendEvent({
      id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
      eventVersion: 1,
      sessionId,
      lapId: null,
      at: session.createdAt,
      actor: "orchestrator",
      type:
        status === "EXPLORING"
          ? "explore.state"
          : status === "PRIORITISING"
            ? "capabilities.ranked"
            : status === "LAPPING"
              ? "lap.started"
              : "report.generated",
      payload: { status },
      evidenceIds: [],
      traceId: `tr_${sessionId}`,
      spanId: `sp_${status.toLowerCase()}`,
      configSha256: session.configSha256,
    });
  }
  session = {
    ...session,
    status: "COMPLETED",
    finishedAt: session.createdAt,
    exitCode: exitCodeFor("COMPLETED", session.defectsFound),
  };
  store.updateSession(session);
  store.appendEvent({
    id: `ev_${String(store.getEvents(sessionId).length).padStart(8, "0")}`,
    eventVersion: 1,
    sessionId,
    lapId: null,
    at: session.createdAt,
    actor: "orchestrator",
    type: "session.finished",
    payload: { status: session.status, exitCode: session.exitCode },
    evidenceIds: [],
    traceId: `tr_${sessionId}`,
    spanId: "sp_finished",
    configSha256: session.configSha256,
  });
  return session;
};