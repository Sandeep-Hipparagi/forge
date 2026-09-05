import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Affordance,
  Capability,
  CapabilityMap,
  Evidence,
  Lap,
  Session,
  SessionEvent,
  State,
  StoredSessionInput,
  Transition,
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

  /**
   * Ensure a session has a persisted storageState JSON file and its path recorded.
   * The producer is called at most once per session; subsequent calls reuse the path.
   *
   * This does NOT persist any credentials itself — it simply writes the opaque
   * storageState blob returned by the producer under `.auth/state.json` and
   * records the relative path on the session row.
   */
  async ensureStorageState(sessionId: string, produce: () => Promise<unknown>): Promise<string> {
    const session = this.getSession(sessionId);
    if (session === null) throw new Error(`Session not found: ${sessionId}`);
    if (session.storageStatePath) {
      return session.storageStatePath;
    }

    const relativePath = `artifacts/sessions/${sessionId}/.auth/state.json`;
    const value = await produce();
    const content = typeof value === "string" ? value : `${JSON.stringify(value)}\n`;

    this.safeWrite(relativePath, content);

    const result = this.database
      .prepare("UPDATE sessions SET storage_state_path = ? WHERE id = ?")
      .run(relativePath, sessionId);
    if (result.changes !== 1) throw new Error(`Session not found: ${sessionId}`);

    return relativePath;
  }

  /**
   * Mark whether exploration reached an authenticated state (FR-003).
   * Credentials themselves are never stored — only the boolean outcome.
   */
  setAuthenticated(sessionId: string, authenticated: boolean): Session {
    const result = this.database
      .prepare("UPDATE sessions SET authenticated = ? WHERE id = ?")
      .run(Number(authenticated), sessionId);
    if (result.changes !== 1) throw new Error(`Session not found: ${sessionId}`);
    return this.getSession(sessionId)!;
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

  /**
   * Persist a full CapabilityMap into the relational tables (05 §4).
   * Replaces any prior map rows for the session so re-explore is idempotent.
   */
  saveCapabilityMap(
    map: CapabilityMap,
    meta?: {
      choiceSource?: "deterministic" | "llm";
      modelCalls?: number;
      exitReason?: string;
    },
  ): CapabilityMap {
    const parsed = CapabilityMap.parse(map);
    const tx = this.database.transaction(() => {
      this.database.prepare("DELETE FROM capabilities WHERE session_id = ?").run(parsed.sessionId);
      this.database.prepare("DELETE FROM transitions WHERE session_id = ?").run(parsed.sessionId);
      this.database
        .prepare(
          `DELETE FROM affordances WHERE state_id IN
           (SELECT id FROM states WHERE session_id = ?)`,
        )
        .run(parsed.sessionId);
      this.database.prepare("DELETE FROM states WHERE session_id = ?").run(parsed.sessionId);

      const insertState = this.database.prepare(
        `INSERT INTO states
         (id, session_id, signature, url, title, auth_required, snapshot_evidence_id,
          visited_variants, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const state of parsed.states) {
        insertState.run(
          state.id,
          state.sessionId,
          state.signature,
          state.url,
          state.title,
          Number(state.authRequired),
          state.snapshotEvidenceId,
          state.visitedVariants,
          state.discoveredAt,
        );
      }

      const insertAffordance = this.database.prepare(
        `INSERT INTO affordances
         (id, state_id, ref, role, accessible_name, kind, enabled, destructive,
          observed_not_exercised, not_exercised_reason, bbox_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const affordance of parsed.affordances) {
        insertAffordance.run(
          affordance.id,
          affordance.stateId,
          affordance.ref,
          affordance.role,
          affordance.accessibleName,
          affordance.kind,
          Number(affordance.enabled),
          Number(affordance.destructive),
          Number(affordance.observedNotExercised),
          affordance.notExercisedReason,
          affordance.bbox === null ? null : JSON.stringify(affordance.bbox),
        );
      }

      const insertTransition = this.database.prepare(
        `INSERT INTO transitions
         (id, session_id, from_state_id, to_state_id, via_affordance_id, action, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const transition of parsed.transitions) {
        insertTransition.run(
          transition.id,
          transition.sessionId,
          transition.fromStateId,
          transition.toStateId,
          transition.viaAffordanceId,
          transition.action,
          transition.observedAt,
        );
      }

      for (const capability of parsed.capabilities) {
        this.saveCapability(capability);
      }

      this.insertEvent(
        {
          sessionId: parsed.sessionId,
          lapId: null,
          actor: "explorer",
          type: "explore.finished",
          payload: {
            frontier: parsed.frontier,
            authenticated: parsed.authenticated,
            stateCount: parsed.states.length,
            capabilityCount: parsed.capabilities.length,
            choiceSource: meta?.choiceSource ?? null,
            modelCalls: meta?.modelCalls ?? null,
            exitReason: meta?.exitReason ?? null,
            capabilities: parsed.capabilities.map(({ name, priorityRank }) => ({
              name,
              priorityRank,
            })),
          },
        },
        [],
      );
    });
    tx();
    return parsed;
  }

  getCapabilityMap(sessionId: string): CapabilityMap | null {
    const session = this.getSession(sessionId);
    if (session === null) return null;

    const stateRows = this.database
      .prepare("SELECT * FROM states WHERE session_id = ? ORDER BY discovered_at, id")
      .all(sessionId) as Array<Record<string, unknown>>;
    if (stateRows.length === 0) return null;

    const states: State[] = stateRows.map((row) => {
      const affordanceIds = (
        this.database
          .prepare("SELECT id FROM affordances WHERE state_id = ? ORDER BY id")
          .all(String(row.id)) as Array<{ id: string }>
      ).map(({ id }) => id);
      return State.parse({
        id: row.id,
        sessionId: row.session_id,
        signature: row.signature,
        url: row.url,
        title: row.title,
        authRequired: Boolean(row.auth_required),
        snapshotEvidenceId: row.snapshot_evidence_id,
        affordanceIds,
        visitedVariants: row.visited_variants,
        discoveredAt: row.discovered_at,
      });
    });

    const affordances = (
      this.database
        .prepare(
          `SELECT a.* FROM affordances a
           INNER JOIN states s ON s.id = a.state_id
           WHERE s.session_id = ?
           ORDER BY a.id`,
        )
        .all(sessionId) as Array<Record<string, unknown>>
    ).map((row) =>
      Affordance.parse({
        id: row.id,
        stateId: row.state_id,
        ref: row.ref,
        role: row.role,
        accessibleName: row.accessible_name,
        kind: row.kind,
        enabled: Boolean(row.enabled),
        destructive: Boolean(row.destructive),
        observedNotExercised: Boolean(row.observed_not_exercised),
        notExercisedReason: row.not_exercised_reason,
        bbox: row.bbox_json === null ? null : JSON.parse(String(row.bbox_json)),
      }),
    );

    const transitions = (
      this.database
        .prepare("SELECT * FROM transitions WHERE session_id = ? ORDER BY observed_at, id")
        .all(sessionId) as Array<Record<string, unknown>>
    ).map((row) =>
      Transition.parse({
        id: row.id,
        sessionId: row.session_id,
        fromStateId: row.from_state_id,
        toStateId: row.to_state_id,
        viaAffordanceId: row.via_affordance_id,
        action: row.action,
        observedAt: row.observed_at,
      }),
    );

    const frontierEvent = [...this.listEvents(sessionId)]
      .reverse()
      .find(
        (event) =>
          event.type === "explore.finished" &&
          event.payload !== null &&
          typeof event.payload === "object" &&
          "frontier" in event.payload,
      );
    const frontierPayload =
      frontierEvent?.payload !== undefined &&
      typeof frontierEvent.payload === "object" &&
      frontierEvent.payload !== null &&
      "frontier" in frontierEvent.payload
        ? (frontierEvent.payload as { frontier: CapabilityMap["frontier"] }).frontier
        : {
            discovered: states.length,
            explored: transitions.length,
            haltReason: "EXHAUSTED" as const,
          };

    return CapabilityMap.parse({
      sessionId,
      authenticated: session.authenticated,
      states,
      affordances,
      transitions,
      capabilities: this.listCapabilities(sessionId),
      apiHints: [],
      frontier: frontierPayload,
    });
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
