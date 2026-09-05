import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Capability,
  Evidence,
  Lap,
  Session,
  SessionEvent,
  StoredSessionInput,
  type ParsedSessionInput,
  type RunContext,
  type SessionStatus,
} from "@forge/core";
import Database from "better-sqlite3";

type HashFn = (content: Buffer) => string;

export type StoreOptions = {
  databasePath: string;
  repositoryRoot: string;
  context: RunContext;
  allowedWriteRoots?: string[];
  hash?: HashFn;
};

export type NewEvidence = Omit<Evidence, "id" | "path" | "sha256" | "bytes" | "capturedAt"> & {
  content: Buffer | string;
};
export type NewSessionEvent = Omit<SessionEvent, "seq" | "at">;

const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|password|token|api[-_]?key)$/i;
const SECRET_SHAPE = /\b(?:sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._~+/-]+=*|api[_-]?key[=:]\S+)\b/gi;
const TEXT_EVIDENCE = new Set<Evidence["type"]>([
  "SNAPSHOT",
  "DOM",
  "CONSOLE",
  "NETWORK",
  "DIFF",
  "PATCH",
  "TRANSCRIPT",
  "PLAN",
  "REPORT",
]);

export function redact<T>(value: T, secrets: readonly string[] = []): T {
  function visit(current: unknown, key?: string): unknown {
    if (key !== undefined && SENSITIVE_KEY.test(key)) {
      return "[REDACTED]";
    }
    if (typeof current === "string") {
      let redacted = current.replace(SECRET_SHAPE, "[REDACTED]");
      for (const secret of secrets.filter(Boolean)) {
        redacted = redacted.replaceAll(secret, "[REDACTED]");
      }
      return redacted;
    }
    if (Array.isArray(current)) {
      return current.map((item) => visit(item));
    }
    if (current !== null && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).map(([childKey, child]) => [childKey, visit(child, childKey)]),
      );
    }
    return current;
  }

  return visit(value) as T;
}

function isInside(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function redactBuffer(content: Buffer, secrets: readonly string[]): Buffer {
  let result = content;
  for (const secret of secrets.filter(Boolean)) {
    const needle = Buffer.from(secret);
    const replacement = Buffer.from("[REDACTED]");
    const chunks: Buffer[] = [];
    let offset = 0;
    let index = result.indexOf(needle, offset);
    while (index >= 0) {
      chunks.push(result.subarray(offset, index), replacement);
      offset = index + needle.length;
      index = result.indexOf(needle, offset);
    }
    if (offset > 0) {
      chunks.push(result.subarray(offset));
      result = Buffer.concat(chunks);
    }
  }
  return result;
}

export class ForgeStore {
  private readonly database: Database.Database;
  private readonly root: string;
  private readonly writeRoots: string[];
  private readonly context: RunContext;
  private readonly hash: HashFn;

  constructor(options: StoreOptions) {
    this.root = resolve(options.repositoryRoot);
    this.writeRoots = (options.allowedWriteRoots ?? ["artifacts", "apps/sut/tests"]).map((path) =>
      resolve(this.root, path),
    );
    this.context = options.context;
    this.hash = options.hash ?? ((content) => createHash("sha256").update(content).digest("hex"));

    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.database = new Database(options.databasePath);
    this.database.pragma("foreign_keys = ON");
    const initialized = this.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .get();
    if (initialized === undefined) {
      const migrationPath = fileURLToPath(new URL("../migrations/001_init.sql", import.meta.url));
      this.database.exec(readFileSync(migrationPath, "utf8"));
    }
  }

  close(): void {
    this.database.close();
  }

  createSession(input: ParsedSessionInput): Session {
    const storedInput = StoredSessionInput.parse(input);
    const session = Session.parse({
      id: this.context.ids.next("ses"),
      input: storedInput,
      status: "CREATED",
      exitCode: null,
      createdAt: this.context.clock.now().toISOString(),
      finishedAt: null,
      usage: null,
    });

    this.database
      .prepare(
        `INSERT INTO sessions (
          id, url, mode, status, authenticated, storage_state_path, exit_code,
          defects_found, input_json, usage_json, created_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.input.url,
        session.input.mode,
        session.status,
        Number(session.authenticated),
        session.storageStatePath,
        session.exitCode,
        session.defectsFound,
        JSON.stringify(session.input),
        null,
        session.createdAt,
        session.finishedAt,
      );
    return session;
  }

  getSession(id: string): Session | null {
    const row = this.database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    if (row === undefined) return null;
    return this.hydrateSession(row);
  }

  listSessions(): Session[] {
    const rows = this.database
      .prepare("SELECT * FROM sessions ORDER BY created_at DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.hydrateSession(row));
  }

  rememberIdempotencyKey(key: string, sessionId: string): void {
    this.database
      .prepare("INSERT INTO idempotency_keys (key, session_id, created_at) VALUES (?, ?, ?)")
      .run(key, sessionId, this.context.clock.now().toISOString());
  }

  sessionForIdempotencyKey(key: string): Session | null {
    const row = this.database
      .prepare(
        `SELECT s.* FROM sessions s
         JOIN idempotency_keys i ON i.session_id = s.id
         WHERE i.key = ?`,
      )
      .get(key) as Record<string, unknown> | undefined;
    return row === undefined ? null : this.hydrateSession(row);
  }

  updateSessionState(
    id: string,
    update: {
      status: SessionStatus;
      exitCode?: number | null;
      defectsFound?: number;
      finishedAt?: string | null;
    },
  ): Session {
    const result = this.database
      .prepare(
        `UPDATE sessions SET
          status = ?,
          exit_code = COALESCE(?, exit_code),
          defects_found = COALESCE(?, defects_found),
          finished_at = COALESCE(?, finished_at)
         WHERE id = ?`,
      )
      .run(
        update.status,
        update.exitCode ?? null,
        update.defectsFound ?? null,
        update.finishedAt ?? null,
        id,
      );
    if (result.changes !== 1) throw new Error(`Session not found: ${id}`);
    return this.getSession(id)!;
  }

  saveCapability(input: Capability): Capability {
    const capability = Capability.parse(input);
    this.database
      .prepare(
        `INSERT INTO capabilities
         (id, session_id, name, description, entry_state_id, risk_score, priority_rank, doc_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        capability.id,
        capability.sessionId,
        capability.name,
        capability.description,
        capability.entryStateId,
        capability.risk.score,
        capability.priorityRank,
        JSON.stringify(capability),
      );
    return capability;
  }

  listCapabilities(sessionId: string): Capability[] {
    const rows = this.database
      .prepare("SELECT doc_json FROM capabilities WHERE session_id = ? ORDER BY priority_rank, id")
      .all(sessionId) as Array<{ doc_json: string }>;
    return rows.map(({ doc_json }) => Capability.parse(JSON.parse(doc_json) as unknown));
  }

  createLap(input: Lap): Lap {
    const lap = Lap.parse(input);
    this.database
      .prepare(
        `INSERT INTO laps (
          id, session_id, capability_id, idx, status, outcome, replan_rounds,
          heal_attempts_json, accepted_risk_json, spec_path, started_at, banked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        lap.id,
        lap.sessionId,
        lap.capabilityId,
        lap.index,
        lap.status,
        lap.outcome,
        lap.replanRounds,
        JSON.stringify(lap.healAttempts),
        JSON.stringify(lap.acceptedRisk),
        lap.specPath,
        lap.startedAt,
        lap.bankedAt,
      );
    return lap;
  }

  updateLap(input: Lap): Lap {
    const lap = Lap.parse(input);
    const result = this.database
      .prepare(
        `UPDATE laps SET
          status = ?, outcome = ?, replan_rounds = ?, heal_attempts_json = ?,
          accepted_risk_json = ?, spec_path = ?, banked_at = ?
         WHERE id = ?`,
      )
      .run(
        lap.status,
        lap.outcome,
        lap.replanRounds,
        JSON.stringify(lap.healAttempts),
        JSON.stringify(lap.acceptedRisk),
        lap.specPath,
        lap.bankedAt,
        lap.id,
      );
    if (result.changes !== 1) throw new Error(`Lap not found: ${lap.id}`);
    return lap;
  }

  listLaps(sessionId: string): Lap[] {
    const rows = this.database
      .prepare("SELECT * FROM laps WHERE session_id = ? ORDER BY idx")
      .all(sessionId) as Record<string, unknown>[];
    return rows.map((row) => this.hydrateLap(row));
  }

  getLap(id: string): Lap | null {
    const row = this.database.prepare("SELECT * FROM laps WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    return row === undefined ? null : this.hydrateLap(row);
  }

  appendEvent(event: NewSessionEvent, secrets: readonly string[] = []): SessionEvent {
    return this.database.transaction(() => this.insertEvent(event, secrets))();
  }

  commitSessionTransition(
    id: string,
    update: Parameters<ForgeStore["updateSessionState"]>[1],
    event: NewSessionEvent,
    secrets: readonly string[] = [],
  ): { session: Session; event: SessionEvent } {
    return this.database.transaction(() => ({
      session: this.updateSessionState(id, update),
      event: this.insertEvent(event, secrets),
    }))();
  }

  commitLapTransition(
    lap: Lap,
    event: NewSessionEvent,
    secrets: readonly string[] = [],
  ): { lap: Lap; event: SessionEvent } {
    return this.database.transaction(() => ({
      lap: this.updateLap(lap),
      event: this.insertEvent(event, secrets),
    }))();
  }

  listEvents(sessionId: string): SessionEvent[] {
    const rows = this.database
      .prepare("SELECT * FROM session_events WHERE session_id = ? ORDER BY seq")
      .all(sessionId) as Record<string, unknown>[];
    return rows.map((row) =>
      SessionEvent.parse({
        seq: row.seq,
        sessionId: row.session_id,
        lapId: row.lap_id,
        at: row.at,
        actor: row.actor,
        type: row.type,
        payload: JSON.parse(String(row.payload_json)) as unknown,
      }),
    );
  }

  putEvidence(input: NewEvidence, secrets: readonly string[] = []): Evidence {
    const raw = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
    const safeContent =
      typeof input.content === "string" || TEXT_EVIDENCE.has(input.type)
        ? Buffer.from(redact(raw.toString("utf8"), secrets), "utf8")
        : redactBuffer(raw, secrets);
    const sha256 = this.hash(safeContent);
    const existing = this.database
      .prepare("SELECT * FROM evidence WHERE session_id = ? AND sha256 = ? AND type = ?")
      .get(input.sessionId, sha256, input.type) as Record<string, unknown> | undefined;
    if (existing !== undefined) return this.hydrateEvidence(existing);

    const id = this.context.ids.next("ev");
    const path = `artifacts/sessions/${input.sessionId}/evidence/${id}-${sha256.slice(0, 12)}`;
    this.safeWrite(path, safeContent);
    const evidence = Evidence.parse({
      ...input,
      content: undefined,
      id,
      path,
      sha256,
      bytes: safeContent.byteLength,
      capturedAt: this.context.clock.now().toISOString(),
      metadata: redact(input.metadata, secrets),
    });
    this.database
      .prepare(
        `INSERT INTO evidence (
          id, session_id, lap_id, run_id, step_id, type, path, sha256, bytes,
          label, metadata_json, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.id,
        evidence.sessionId,
        evidence.lapId,
        evidence.runId,
        evidence.stepId,
        evidence.type,
        evidence.path,
        evidence.sha256,
        evidence.bytes,
        evidence.label,
        JSON.stringify(evidence.metadata),
        evidence.capturedAt,
      );
    return evidence;
  }

  resolveEvidence(ids: readonly string[]): Evidence[] {
    const statement = this.database.prepare("SELECT * FROM evidence WHERE id = ?");
    return ids.map((id) => {
      const row = statement.get(id) as Record<string, unknown> | undefined;
      if (row === undefined) throw new Error(`Evidence not found: ${id}`);
      return this.hydrateEvidence(row);
    });
  }

  readEvidenceContent(id: string): { evidence: Evidence; content: Buffer } | null {
    const row = this.database.prepare("SELECT * FROM evidence WHERE id = ?").get(id) as
      Record<string, unknown> | undefined;
    if (row === undefined) return null;
    const evidence = this.hydrateEvidence(row);
    return { evidence, content: readFileSync(resolve(this.root, evidence.path)) };
  }

  safeWrite(relativePath: string, content: Buffer | string): string {
    const target = resolve(this.root, relativePath);
    if (!this.writeRoots.some((allowed) => isInside(target, allowed))) {
      throw new Error(`Write path is outside the allowlist: ${relativePath}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    writeFileSync(temporary, content);
    renameSync(temporary, target);
    return target;
  }

  private insertEvent(event: NewSessionEvent, secrets: readonly string[]): SessionEvent {
    const row = this.database
      .prepare(
        "SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM session_events WHERE session_id = ?",
      )
      .get(event.sessionId) as { next_seq: number };
    const complete = SessionEvent.parse({
      ...event,
      seq: row.next_seq,
      at: this.context.clock.now().toISOString(),
      payload: redact(event.payload, secrets),
    });
    this.database
      .prepare(
        `INSERT INTO session_events
         (session_id, seq, lap_id, at, actor, type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        complete.sessionId,
        complete.seq,
        complete.lapId,
        complete.at,
        complete.actor,
        complete.type,
        JSON.stringify(complete.payload),
      );
    return complete;
  }

  private hydrateEvidence(row: Record<string, unknown>): Evidence {
    return Evidence.parse({
      id: row.id,
      sessionId: row.session_id,
      lapId: row.lap_id,
      runId: row.run_id,
      stepId: row.step_id,
      type: row.type,
      path: row.path,
      sha256: row.sha256,
      bytes: row.bytes,
      capturedAt: row.captured_at,
      label: row.label,
      metadata: JSON.parse(String(row.metadata_json)) as unknown,
    });
  }

  private hydrateSession(row: Record<string, unknown>): Session {
    return Session.parse({
      id: row.id,
      input: JSON.parse(String(row.input_json)) as unknown,
      status: row.status,
      authenticated: Boolean(row.authenticated),
      storageStatePath: row.storage_state_path,
      exitCode: row.exit_code,
      defectsFound: row.defects_found,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      usage: row.usage_json === null ? null : (JSON.parse(String(row.usage_json)) as unknown),
    });
  }

  private hydrateLap(row: Record<string, unknown>): Lap {
    return Lap.parse({
      id: row.id,
      sessionId: row.session_id,
      capabilityId: row.capability_id,
      index: row.idx,
      status: row.status,
      outcome: row.outcome,
      replanRounds: row.replan_rounds,
      healAttempts: JSON.parse(String(row.heal_attempts_json)) as unknown,
      acceptedRisk: JSON.parse(String(row.accepted_risk_json)) as unknown,
      specPath: row.spec_path,
      startedAt: row.started_at,
      bankedAt: row.banked_at,
    });
  }
}
