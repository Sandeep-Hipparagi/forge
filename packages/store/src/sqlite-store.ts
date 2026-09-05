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

interface SessionRow {
  id: string;
  status: string;
  input_json: string;
  config_json: string;
  config_sha256: string;
  created_at: string;
  finished_at: string | null;
  exit_code: number | null;
  defects_found: number;
}

interface EvidenceRow {
  id: string;
  session_id: string;
  type: string;
  path: string;
  sha256: string;
  bytes: number;
  metadata_json: string;
  captured_at: string;
}

interface LapRow {
  id: string;
  session_id: string;
  replan_rounds: number;
}

interface RunRow {
  id: string;
  lap_id: string;
  scenario_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  error_message: string | null;
}

interface RunStepRow {
  id: string;
  run_id: string;
  step_order: number;
  kind: string;
  target_intent: string | null;
  state_id: string | null;
  affordance_ref: string | null;
  locator: string | null;
  input: string | null;
  timeout_ms: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  evidence_ids_json: string;
}

interface DiagnosisRow {
  id: string;
  run_id: string;
  step_id: string;
  kind: string;
  message: string;
  locator: string | null;
  selector: string | null;
  confidence: number;
  created_at: string;
}

interface HealCandidateRow {
  id: string;
  diagnosis_id: string;
  strategy: string;
  proposed_locator: string | null;
  proposed_selector: string | null;
  confidence: number;
  created_at: string;
}

interface PatchRow {
  id: string;
  heal_candidate_id: string;
  file_path: string;
  diff_text: string;
  applied_at: string | null;
  status: string;
}

interface FingerprintRow {
  id: string;
  session_id: string;
  selector: string;
  attributes_json: string;
  stability_score: number;
  created_at: string;
}

interface ReportRow {
  id: string;
  session_id: string;
  markdown_path: string;
  json_path: string | null;
  generated_at: string;
  defects_found: number;
}

interface RobustnessScoreRow {
  id: string;
  session_id: string;
  capability_id: string;
  score: number;
  breakdown_json: string;
  computed_at: string;
}

type SessionInput = {
  status: string;
  input: unknown;
  config: unknown;
  configSha256: string;
  createdAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  defectsFound: number;
};

export class DurableEventStore {
  readonly #db: Database.Database;
  readonly #events = new EventEmitter();

  constructor(
    path = ":memory:",
    private readonly clock: Clock,
  ) {
    this.#db = new Database(path);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, status TEXT NOT NULL, input_json TEXT NOT NULL,
        config_json TEXT NOT NULL, config_sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
        finished_at TEXT, exit_code INTEGER, defects_found INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS session_events (
        session_id TEXT NOT NULL REFERENCES sessions(id), seq INTEGER NOT NULL,
        event_json TEXT NOT NULL, PRIMARY KEY (session_id, seq)
      );
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
        type TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
        metadata_json TEXT NOT NULL, captured_at TEXT NOT NULL,
        UNIQUE(session_id, sha256, type)
      );
      CREATE TABLE IF NOT EXISTS laps (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
        replan_rounds INTEGER NOT NULL DEFAULT 0 CHECK (replan_rounds <= 2)
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
        scenario_id TEXT NOT NULL, status TEXT NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT,
        exit_code INTEGER, error_message TEXT
      );
      CREATE TABLE IF NOT EXISTS run_steps (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
        step_order INTEGER NOT NULL, kind TEXT NOT NULL,
        target_intent TEXT, state_id TEXT, affordance_ref TEXT,
        locator TEXT, input TEXT, timeout_ms INTEGER,
        status TEXT NOT NULL, started_at TEXT, finished_at TEXT,
        error_message TEXT, evidence_ids_json TEXT
      );
      CREATE TABLE IF NOT EXISTS diagnoses (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
        step_id TEXT NOT NULL, kind TEXT NOT NULL,
        message TEXT NOT NULL, locator TEXT, selector TEXT,
        confidence REAL NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS heal_candidates (
        id TEXT PRIMARY KEY, diagnosis_id TEXT NOT NULL REFERENCES diagnoses(id),
        strategy TEXT NOT NULL, proposed_locator TEXT,
        proposed_selector TEXT, confidence REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS patches (
        id TEXT PRIMARY KEY, heal_candidate_id TEXT NOT NULL REFERENCES heal_candidates(id),
        file_path TEXT NOT NULL, diff_text TEXT NOT NULL,
        applied_at TEXT, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fingerprints (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
        selector TEXT NOT NULL, attributes_json TEXT NOT NULL,
        stability_score REAL NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(session_id, selector)
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
        markdown_path TEXT NOT NULL, json_path TEXT,
        generated_at TEXT NOT NULL, defects_found INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS robustness_scores (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
        capability_id TEXT NOT NULL, score REAL NOT NULL,
        breakdown_json TEXT NOT NULL, computed_at TEXT NOT NULL
      );
    `);
  }

  createSession(id: string, session: SessionInput): void {
    this.#db
      .prepare(
        "INSERT INTO sessions (id, status, input_json, config_json, config_sha256, created_at, finished_at, exit_code, defects_found) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        session.status,
        JSON.stringify(session.input),
        JSON.stringify(session.config),
        session.configSha256,
        session.createdAt,
        session.finishedAt ?? null,
        session.exitCode ?? null,
        session.defectsFound ?? 0,
      );
  }

  getSession<T>(id: string): T | undefined {
    const row = this.#db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      status: row.status,
      input: JSON.parse(row.input_json),
      config: JSON.parse(row.config_json),
      configSha256: row.config_sha256,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      exitCode: row.exit_code,
      defectsFound: row.defects_found,
    } as T;
  }

  updateSession(id: string, session: SessionInput): void {
    this.#db
      .prepare(
        "UPDATE sessions SET status = ?, input_json = ?, config_json = ?, config_sha256 = ?, finished_at = ?, exit_code = ?, defects_found = ? WHERE id = ?",
      )
      .run(
        session.status,
        JSON.stringify(session.input),
        JSON.stringify(session.config),
        session.configSha256,
        session.finishedAt ?? null,
        session.exitCode ?? null,
        session.defectsFound ?? 0,
        id,
      );
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
      const seqResult = this.#db
        .prepare(
          "SELECT COALESCE(MAX(seq), -1) + 1 as seq FROM session_events WHERE session_id = ?",
        )
        .get(sessionId) as { seq: number };
      const seq = seqResult.seq;
      this.#db
        .prepare(
          "INSERT INTO session_events (session_id, seq, event_json) VALUES (?, ?, ?)",
        )
        .run(
          sessionId,
          seq,
          JSON.stringify({ type, payload, sha256, createdAt }),
        );
      return {
        id: seq,
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

  after(sessionId: string, seq = -1): StoredEvent[] {
    return this.#db
      .prepare(
        "SELECT seq as id, session_id as sessionId, json_extract(event_json, '$.type') as type, json_extract(event_json, '$.payload') as payload, json_extract(event_json, '$.sha256') as sha256, json_extract(event_json, '$.createdAt') as createdAt FROM session_events WHERE session_id = ? AND seq > ? ORDER BY seq",
      )
      .all(sessionId, seq) as StoredEvent[];
  }

  getEvents(sessionId: string, since = -1): StoredEvent[] {
    return this.after(sessionId, since);
  }

  subscribe(
    sessionId: string,
    listener: (event: StoredEvent) => void,
  ): () => void {
    this.#events.on(sessionId, listener);
    return () => this.#events.off(sessionId, listener);
  }

  putEvidence(evidence: EvidenceRow): EvidenceRow {
    const existing = this.#db
      .prepare(
        "SELECT * FROM evidence WHERE session_id = ? AND type = ? AND sha256 = ?",
      )
      .get(evidence.session_id, evidence.type, evidence.sha256) as
      | EvidenceRow
      | undefined;
    if (existing) return existing;
    this.#db
      .prepare(
        "INSERT INTO evidence (id, session_id, type, path, sha256, bytes, metadata_json, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        evidence.id,
        evidence.session_id,
        evidence.type,
        evidence.path,
        evidence.sha256,
        evidence.bytes,
        evidence.metadata_json,
        evidence.captured_at,
      );
    return evidence;
  }

  getEvidence(sessionId: string): EvidenceRow[] {
    return this.#db
      .prepare("SELECT * FROM evidence WHERE session_id = ?")
      .all(sessionId) as EvidenceRow[];
  }

  createLap(lap: LapRow): void {
    this.#db
      .prepare(
        "INSERT INTO laps (id, session_id, replan_rounds) VALUES (?, ?, ?)",
      )
      .run(lap.id, lap.session_id, lap.replan_rounds ?? 0);
  }

  updateLap(lap: LapRow): void {
    this.#db
      .prepare("UPDATE laps SET replan_rounds = ? WHERE id = ?")
      .run(lap.replan_rounds ?? 0, lap.id);
  }

  getLap(id: string): LapRow | undefined {
    return this.#db.prepare("SELECT * FROM laps WHERE id = ?").get(id) as
      | LapRow
      | undefined;
  }

  getLapsBySession(sessionId: string): LapRow[] {
    return this.#db
      .prepare("SELECT * FROM laps WHERE session_id = ?")
      .all(sessionId) as LapRow[];
  }

  createRun(run: RunRow): void {
    this.#db
      .prepare(
        "INSERT INTO runs (id, lap_id, scenario_id, status, started_at, finished_at, exit_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        run.id,
        run.lap_id,
        run.scenario_id,
        run.status,
        run.started_at,
        run.finished_at ?? null,
        run.exit_code ?? null,
        run.error_message ?? null,
      );
  }

  updateRun(run: RunRow): void {
    this.#db
      .prepare(
        "UPDATE runs SET status = ?, finished_at = ?, exit_code = ?, error_message = ? WHERE id = ?",
      )
      .run(
        run.status,
        run.finished_at ?? null,
        run.exit_code ?? null,
        run.error_message ?? null,
        run.id,
      );
  }

  getRun(id: string): RunRow | undefined {
    return this.#db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as
      | RunRow
      | undefined;
  }

  getRunsByLap(lapId: string): RunRow[] {
    return this.#db
      .prepare("SELECT * FROM runs WHERE lap_id = ?")
      .all(lapId) as RunRow[];
  }

  createRunStep(step: RunStepRow): void {
    this.#db
      .prepare(
        "INSERT INTO run_steps (id, run_id, step_order, kind, target_intent, state_id, affordance_ref, locator, input, timeout_ms, status, started_at, finished_at, error_message, evidence_ids_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        step.id,
        step.run_id,
        step.step_order,
        step.kind,
        step.target_intent,
        step.state_id,
        step.affordance_ref ?? null,
        step.locator ?? null,
        step.input ?? null,
        step.timeout_ms,
        step.status,
        step.started_at ?? null,
        step.finished_at ?? null,
        step.error_message ?? null,
        step.evidence_ids_json,
      );
  }

  updateRunStep(step: RunStepRow): void {
    this.#db
      .prepare(
        "UPDATE run_steps SET status = ?, finished_at = ?, error_message = ?, evidence_ids_json = ? WHERE id = ?",
      )
      .run(
        step.status,
        step.finished_at ?? null,
        step.error_message ?? null,
        step.evidence_ids_json,
        step.id,
      );
  }

  getRunSteps(runId: string): RunStepRow[] {
    return this.#db
      .prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_order")
      .all(runId) as RunStepRow[];
  }

  createDiagnosis(diagnosis: DiagnosisRow): void {
    this.#db
      .prepare(
        "INSERT INTO diagnoses (id, run_id, step_id, kind, message, locator, selector, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        diagnosis.id,
        diagnosis.run_id,
        diagnosis.step_id,
        diagnosis.kind,
        diagnosis.message,
        diagnosis.locator ?? null,
        diagnosis.selector ?? null,
        diagnosis.confidence,
        diagnosis.created_at,
      );
  }

  getDiagnosesByRun(runId: string): DiagnosisRow[] {
    return this.#db
      .prepare("SELECT * FROM diagnoses WHERE run_id = ?")
      .all(runId) as DiagnosisRow[];
  }

  createHealCandidate(candidate: HealCandidateRow): void {
    this.#db
      .prepare(
        "INSERT INTO heal_candidates (id, diagnosis_id, strategy, proposed_locator, proposed_selector, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        candidate.id,
        candidate.diagnosis_id,
        candidate.strategy,
        candidate.proposed_locator ?? null,
        candidate.proposed_selector ?? null,
        candidate.confidence,
        candidate.created_at,
      );
  }

  getHealCandidatesByDiagnosis(diagnosisId: string): HealCandidateRow[] {
    return this.#db
      .prepare("SELECT * FROM heal_candidates WHERE diagnosis_id = ?")
      .all(diagnosisId) as HealCandidateRow[];
  }

  createPatch(patch: PatchRow): void {
    this.#db
      .prepare(
        "INSERT INTO patches (id, heal_candidate_id, file_path, diff_text, applied_at, status) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        patch.id,
        patch.heal_candidate_id,
        patch.file_path,
        patch.diff_text,
        patch.applied_at ?? null,
        patch.status,
      );
  }

  updatePatch(patch: PatchRow): void {
    this.#db
      .prepare("UPDATE patches SET applied_at = ?, status = ? WHERE id = ?")
      .run(patch.applied_at ?? null, patch.status, patch.id);
  }

  getPatchesByHealCandidate(healCandidateId: string): PatchRow[] {
    return this.#db
      .prepare("SELECT * FROM patches WHERE heal_candidate_id = ?")
      .all(healCandidateId) as PatchRow[];
  }

  putFingerprint(fingerprint: FingerprintRow): FingerprintRow {
    const existing = this.#db
      .prepare(
        "SELECT * FROM fingerprints WHERE session_id = ? AND selector = ?",
      )
      .get(fingerprint.session_id, fingerprint.selector) as
      | FingerprintRow
      | undefined;
    if (existing) return existing;
    this.#db
      .prepare(
        "INSERT INTO fingerprints (id, session_id, selector, attributes_json, stability_score, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        fingerprint.id,
        fingerprint.session_id,
        fingerprint.selector,
        fingerprint.attributes_json,
        fingerprint.stability_score,
        fingerprint.created_at,
      );
    return fingerprint;
  }

  getFingerprint(
    sessionId: string,
    selector: string,
  ): FingerprintRow | undefined {
    return this.#db
      .prepare(
        "SELECT * FROM fingerprints WHERE session_id = ? AND selector = ?",
      )
      .get(sessionId, selector) as FingerprintRow | undefined;
  }

  createReport(report: ReportRow): void {
    this.#db
      .prepare(
        "INSERT INTO reports (id, session_id, markdown_path, json_path, generated_at, defects_found) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        report.id,
        report.session_id,
        report.markdown_path,
        report.json_path ?? null,
        report.generated_at,
        report.defects_found ?? 0,
      );
  }

  getReportBySession(sessionId: string): ReportRow | undefined {
    return this.#db
      .prepare("SELECT * FROM reports WHERE session_id = ?")
      .get(sessionId) as ReportRow | undefined;
  }

  createRobustnessScore(score: RobustnessScoreRow): void {
    this.#db
      .prepare(
        "INSERT INTO robustness_scores (id, session_id, capability_id, score, breakdown_json, computed_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        score.id,
        score.session_id,
        score.capability_id,
        score.score,
        score.breakdown_json,
        score.computed_at,
      );
  }

  getRobustnessScoresBySession(sessionId: string): RobustnessScoreRow[] {
    return this.#db
      .prepare("SELECT * FROM robustness_scores WHERE session_id = ?")
      .all(sessionId) as RobustnessScoreRow[];
  }
}
