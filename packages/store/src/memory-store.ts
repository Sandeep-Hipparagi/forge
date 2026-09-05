import { createHash } from "node:crypto";
import type { Evidence, Session, SessionEvent } from "@forge/core";

export class MemoryStore {
  readonly sessions = new Map<string, Session>();
  readonly events = new Map<string, SessionEvent[]>();
  readonly evidence = new Map<string, Evidence>();

  createSession(session: Session): void {
    if (this.sessions.has(session.id))
      throw new Error("session already exists");
    this.sessions.set(session.id, session);
    this.events.set(session.id, []);
  }

  updateSession(session: Session): void {
    if (!this.sessions.has(session.id)) throw new Error("unknown session");
    this.sessions.set(session.id, session);
  }

  appendEvent(event: Omit<SessionEvent, "seq">): SessionEvent {
    const events = this.events.get(event.sessionId);
    if (!events) throw new Error("unknown session");
    const stored = { ...event, seq: events.length };
    events.push(stored);
    return stored;
  }

  getEvents(sessionId: string, since = -1): SessionEvent[] {
    return (this.events.get(sessionId) ?? []).filter(
      (event) => event.seq > since,
    );
  }

  putEvidence(evidence: Evidence): Evidence {
    const existing = [...this.evidence.values()].find(
      (item) =>
        item.sessionId === evidence.sessionId &&
        item.type === evidence.type &&
        item.sha256 === evidence.sha256,
    );
    if (existing) return existing;
    this.evidence.set(evidence.id, evidence);
    return evidence;
  }
}

export const sha256 = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

export const safeArtifactPath = (relativePath: string): string => {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith("artifacts/") || normalized.includes("../"))
    throw new Error("evidence path must remain inside artifacts/");
  return normalized;
};

export const redact = (value: string): string =>
  value
    .replace(
      /(authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi,
      "$1: [REDACTED]",
    )
    .replace(/(?:sk|api)[_-][a-z0-9_-]{8,}/gi, "[REDACTED]");
