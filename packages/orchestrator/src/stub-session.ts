import type { Session, SessionStatus } from "@forge/core";
import { MemoryStore } from "@forge/store";
import { exitCodeFor } from "./guards.js";

const terminal = new Set<SessionStatus>([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);
export const isTerminal = (status: SessionStatus): boolean =>
  terminal.has(status);

export const runStubSession = (
  store: MemoryStore,
  sessionId: string,
): Session => {
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
