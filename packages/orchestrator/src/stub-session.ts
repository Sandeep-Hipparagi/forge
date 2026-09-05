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
  getSession?(sessionId: string): Session | undefined;
  getEvents(sessionId: string, since?: number): SessionEvent[];
  appendEvent(event: Omit<SessionEvent, "seq">): SessionEvent;
  subscribe?(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): () => void;
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
  // Phase 1 is intentionally deterministic and network-free. The real browser
  // explorer is introduced by the Phase 2 execution gate; keeping this entry
  // point on the canonical stub prevents credentials or external I/O from
  // leaking into the Phase 1 runtime.
  return runStubSession(store, sessionId);
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
