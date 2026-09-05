PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, status TEXT NOT NULL, input_json TEXT NOT NULL,
  config_json TEXT NOT NULL, config_sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
  finished_at TEXT, exit_code INTEGER, defects_found INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL,
  event_json TEXT NOT NULL, PRIMARY KEY (session_id, seq)
);
CREATE TABLE evidence (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
  metadata_json TEXT NOT NULL, captured_at TEXT NOT NULL,
  UNIQUE(session_id, sha256, type)
);
CREATE TABLE laps (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  replan_rounds INTEGER NOT NULL DEFAULT 0 CHECK (replan_rounds <= 2)
);
