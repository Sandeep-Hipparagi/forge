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
CREATE TABLE runs (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  scenario_id TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT,
  exit_code INTEGER, error_message TEXT
);
CREATE TABLE run_steps (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  step_order INTEGER NOT NULL, kind TEXT NOT NULL,
  target_intent TEXT, state_id TEXT, affordance_ref TEXT,
  locator TEXT, input TEXT, timeout_ms INTEGER,
  status TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  error_message TEXT, evidence_ids_json TEXT
);
CREATE TABLE diagnoses (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL, kind TEXT NOT NULL,
  message TEXT NOT NULL, locator TEXT, selector TEXT,
  confidence REAL NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE heal_candidates (
  id TEXT PRIMARY KEY, diagnosis_id TEXT NOT NULL REFERENCES diagnoses(id),
  strategy TEXT NOT NULL, proposed_locator TEXT,
  proposed_selector TEXT, confidence REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE patches (
  id TEXT PRIMARY KEY, heal_candidate_id TEXT NOT NULL REFERENCES heal_candidates(id),
  file_path TEXT NOT NULL, diff_text TEXT NOT NULL,
  applied_at TEXT, status TEXT NOT NULL
);
CREATE TABLE fingerprints (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  selector TEXT NOT NULL, attributes_json TEXT NOT NULL,
  stability_score REAL NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(session_id, selector)
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  markdown_path TEXT NOT NULL, json_path TEXT,
  generated_at TEXT NOT NULL, defects_found INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE robustness_scores (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  capability_id TEXT NOT NULL, score REAL NOT NULL,
  breakdown_json TEXT NOT NULL, computed_at TEXT NOT NULL
);
