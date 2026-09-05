PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'autopilot',
  status TEXT NOT NULL, authenticated INTEGER NOT NULL DEFAULT 0,
  storage_state_path TEXT, exit_code INTEGER, defects_found INTEGER NOT NULL DEFAULT 0,
  input_json TEXT NOT NULL,
  usage_json TEXT, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  created_at TEXT NOT NULL
);

CREATE TABLE session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL, lap_id TEXT, at TEXT NOT NULL,
  actor TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE TRIGGER session_events_no_update
BEFORE UPDATE ON session_events
BEGIN SELECT RAISE(ABORT, 'session_events is append-only'); END;
CREATE TRIGGER session_events_no_delete
BEFORE DELETE ON session_events
BEGIN SELECT RAISE(ABORT, 'session_events is append-only'); END;

CREATE TABLE states (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  signature TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
  auth_required INTEGER NOT NULL DEFAULT 0, snapshot_evidence_id TEXT NOT NULL,
  visited_variants INTEGER NOT NULL DEFAULT 1, discovered_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_state_sig ON states(session_id, signature);

CREATE TABLE affordances (
  id TEXT PRIMARY KEY, state_id TEXT NOT NULL REFERENCES states(id),
  ref TEXT NOT NULL, role TEXT NOT NULL, accessible_name TEXT, kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, destructive INTEGER NOT NULL DEFAULT 0,
  observed_not_exercised INTEGER NOT NULL DEFAULT 0, not_exercised_reason TEXT,
  bbox_json TEXT
);
CREATE INDEX idx_aff_state ON affordances(state_id);

CREATE TABLE transitions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  from_state_id TEXT NOT NULL, to_state_id TEXT NOT NULL,
  via_affordance_id TEXT NOT NULL, action TEXT NOT NULL, observed_at TEXT NOT NULL
);
CREATE INDEX idx_tr_session ON transitions(session_id, from_state_id);

CREATE TABLE capabilities (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL, description TEXT NOT NULL, entry_state_id TEXT NOT NULL,
  risk_score REAL NOT NULL, priority_rank INTEGER NOT NULL, doc_json TEXT NOT NULL
);
CREATE INDEX idx_cap_rank ON capabilities(session_id, priority_rank);

CREATE TABLE laps (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  capability_id TEXT NOT NULL REFERENCES capabilities(id),
  idx INTEGER NOT NULL, status TEXT NOT NULL, outcome TEXT,
  replan_rounds INTEGER NOT NULL DEFAULT 0 CHECK (replan_rounds <= 2),
  heal_attempts_json TEXT NOT NULL DEFAULT '{}',
  accepted_risk_json TEXT NOT NULL DEFAULT '[]',
  spec_path TEXT, started_at TEXT NOT NULL, banked_at TEXT
);
CREATE INDEX idx_lap_session ON laps(session_id, idx);

CREATE TABLE test_plans (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  capability_id TEXT NOT NULL, round INTEGER NOT NULL,
  markdown_path TEXT NOT NULL, doc_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_plan_round ON test_plans(lap_id, round);

CREATE TABLE coverage_assessments (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  plan_id TEXT NOT NULL REFERENCES test_plans(id), round INTEGER NOT NULL,
  score REAL NOT NULL, floor REAL NOT NULL, verdict TEXT NOT NULL,
  source TEXT NOT NULL, doc_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_assess_plan ON coverage_assessments(plan_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  scenario_id TEXT NOT NULL, status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, finished_at TEXT, duration_ms INTEGER,
  diagnosis_source TEXT, verification_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_runs_lap ON runs(lap_id, started_at DESC);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  lap_id TEXT, run_id TEXT, step_id TEXT, type TEXT NOT NULL,
  path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
  label TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL
);
CREATE INDEX idx_ev_run ON evidence(run_id, step_id);
CREATE UNIQUE INDEX idx_ev_content ON evidence(session_id, sha256, type);

CREATE TABLE fingerprints (
  id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL, step_id TEXT NOT NULL,
  captured_in_run_id TEXT NOT NULL, doc_json TEXT NOT NULL, captured_at TEXT NOT NULL
);
CREATE INDEX idx_fp_step ON fingerprints(scenario_id, step_id, captured_at DESC);

CREATE TABLE diagnoses (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL, kind TEXT NOT NULL, confidence REAL NOT NULL,
  explanation TEXT NOT NULL, recommended_action TEXT NOT NULL, source TEXT NOT NULL,
  vetoes_json TEXT NOT NULL DEFAULT '[]', final INTEGER NOT NULL DEFAULT 0,
  evidence_ids_json TEXT NOT NULL, defect_report_json TEXT,
  failure_signature TEXT NOT NULL, same_root_cause_as TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_diag_sig ON diagnoses(failure_signature);

CREATE TABLE heal_candidates (
  id TEXT PRIMARY KEY, diagnosis_id TEXT NOT NULL REFERENCES diagnoses(id),
  rank INTEGER NOT NULL, strategy TEXT NOT NULL, locator TEXT NOT NULL,
  resolved_count INTEGER NOT NULL, signals_json TEXT NOT NULL,
  score REAL NOT NULL, rationale TEXT NOT NULL,
  blocked_by_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE patches (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  scenario_id TEXT NOT NULL, step_id TEXT NOT NULL,
  before_locator TEXT NOT NULL, after_locator TEXT NOT NULL, diff TEXT NOT NULL,
  before_file_sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL, verified_at TEXT, reverted_at TEXT
);

CREATE TABLE quality_reports (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  score_current REAL NOT NULL, score_projected REAL NOT NULL,
  doc_json TEXT NOT NULL, generated_at TEXT NOT NULL
);
