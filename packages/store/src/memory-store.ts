import { createHash } from "node:crypto";
import type { Evidence, Session, SessionEvent } from "@forge/core";

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

export class MemoryStore {
  readonly sessions = new Map<string, Session>();
  readonly events = new Map<string, SessionEvent[]>();
  readonly evidence = new Map<string, Evidence>();
  readonly laps = new Map<string, LapRecord>();
  readonly reports = new Map<string, ReportRecord>();
  readonly #listeners = new Map<string, Set<(event: SessionEvent) => void>>();

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

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  appendEvent(event: Omit<SessionEvent, "seq">): SessionEvent {
    const events = this.events.get(event.sessionId);
    if (!events) throw new Error("unknown session");
    const stored = { ...event, seq: events.length };
    events.push(stored);
    for (const listener of this.#listeners.get(event.sessionId) ?? [])
      listener(stored);
    return stored;
  }

  subscribe(
    sessionId: string,
    listener: (event: SessionEvent) => void,
  ): () => void {
    const listeners = this.#listeners.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(sessionId);
    };
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

  getEvidence(sessionId: string): Evidence[] {
    return [...this.evidence.values()].filter(
      (item) => item.sessionId === sessionId,
    );
  }

  createLap(lap: LapRecord): void {
    this.laps.set(lap.id, lap);
  }

  getLap(id: string): LapRecord | undefined {
    return this.laps.get(id);
  }

  getLapsBySession(sessionId: string): LapRecord[] {
    return [...this.laps.values()].filter((lap) => lap.sessionId === sessionId);
  }

  createReport(report: ReportRecord): void {
    this.reports.set(report.id, report);
  }

  getReportBySession(sessionId: string): ReportRecord | undefined {
    return [...this.reports.values()].find(
      (report) => report.sessionId === sessionId,
    );
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
