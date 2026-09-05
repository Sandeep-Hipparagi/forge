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
  }
  session = {
    ...session,
    status: "COMPLETED",
    finishedAt: session.createdAt,
    exitCode: exitCodeFor("COMPLETED", session.defectsFound),
  };
  store.updateSession(session);
  return session;
};
