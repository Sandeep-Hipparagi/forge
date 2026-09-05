import Database from "better-sqlite3";
import { EventEmitter } from "node:events";
import type { Clock } from "@forge/core";

export interface StoredEvent {
  id: number;
  sessionId: string;
  type: string;
  payload: string;
  sha256: string;
  createdAt: string;
}

export class DurableEventStore {
  readonly #db: Database.Database;
  readonly #events = new EventEmitter();

  constructor(
    path = ":memory:",
    private readonly clock: Clock,
  ) {
    this.#db = new Database(path);
    this.#db.pragma("journal_mode = WAL");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS durable_sessions (
        id TEXT PRIMARY KEY, doc_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS durable_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
        type TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_durable_events_session_id
        ON durable_events(session_id, id);
    `);
  }

  createSession(id: string, session: unknown): void {
    this.#db
      .prepare("INSERT INTO durable_sessions (id, doc_json) VALUES (?, ?)")
      .run(id, JSON.stringify(session));
  }

  getSession<T>(id: string): T | undefined {
    const row = this.#db
      .prepare("SELECT doc_json FROM durable_sessions WHERE id = ?")
      .get(id) as { doc_json: string } | undefined;
    return row ? (JSON.parse(row.doc_json) as T) : undefined;
  }

  updateSession(id: string, session: unknown): void {
    this.#db
      .prepare("UPDATE durable_sessions SET doc_json = ? WHERE id = ?")
      .run(JSON.stringify(session), id);
  }

  append(
    sessionId: string,
    type: string,
    payload: Record<string, unknown>,
    sha256: string,
  ): StoredEvent {
    const createdAt = this.clock.now().toISOString();
    const serialized = JSON.stringify(payload);
    const result = this.#db.transaction(() => {
      const info = this.#db
        .prepare(
          "INSERT INTO durable_events (session_id, type, payload, sha256, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(sessionId, type, serialized, sha256, createdAt);
      return {
        id: Number(info.lastInsertRowid),
        sessionId,
        type,
        payload: serialized,
        sha256,
        createdAt,
      };
    })();
    this.#events.emit(sessionId, result);
    return result;
  }

  after(sessionId: string, id = 0): StoredEvent[] {
    return this.#db
      .prepare(
        "SELECT id, session_id as sessionId, type, payload, sha256, created_at as createdAt FROM durable_events WHERE session_id = ? AND id > ? ORDER BY id",
      )
      .all(sessionId, id) as StoredEvent[];
  }

  subscribe(
    sessionId: string,
    listener: (event: StoredEvent) => void,
  ): () => void {
    this.#events.on(sessionId, listener);
    return () => this.#events.off(sessionId, listener);
  }
}
