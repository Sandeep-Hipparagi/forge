# Engineering Contracts

This document is the low-level build contract. New code must conform to these shapes; it must not invent a second protocol.

## 1. Public API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/sessions` | Create and start a QA session. |
| `GET` | `/v1/sessions/:id` | Read persisted session state and summary. |
| `GET` | `/v1/sessions/:id/events` | Stream ordered SSE events. |
| `GET` | `/v1/sessions/:id/report` | Read the current/final Quality Report. |
| `POST` | `/v1/sessions/:id/cancel` | Safely request cancellation at a transition boundary. |
| `GET` | `/healthz` | Dependency and browser readiness. |

### Create session

```ts
type CreateSessionRequest = {
  targetUrl: string;
  credentials?: { username: string; password: string };
  intent?: string;
  prd?: { name: string; content: string };
  profile?: "safe" | "disposable";
  budgets?: Partial<SessionBudgets>;
};

type CreateSessionResponse = {
  sessionId: string;
  status: "INITIALIZE";
  eventsUrl: string;
};
```

Reject non-HTTP(S) URLs, embedded credentials in URLs, invalid credential shape, and `disposable` profiles not registered by the server. The API never returns passwords.

## 2. Event envelope

```ts
type SessionEvent<T = unknown> = {
  id: string;
  sessionId: string;
  sequence: number;
  at: string; // ISO-8601 UTC
  type: EventType;
  actor: "orchestrator" | "explorer" | "planner" | "critic" |
         "generator" | "runner" | "triage" | "healer" | "reporter";
  payload: T;
  evidenceIds: string[];
};
```

Allowed types are `session.created`, `state.changed`, `capability.discovered`, `plan.created`, `coverage.assessed`, `plan.blocked`, `test.generated`, `run.completed`, `failure.diagnosed`, `heal.proposed`, `heal.blocked`, `patch.applied`, `patch.rolled_back`, `defect.created`, `report.updated`, and `session.completed`.

Persist an event and its referenced evidence before publishing it. A reconnecting SSE client asks for events after a sequence number; delivery is at-least-once, so the dashboard deduplicates by event ID.

### Event compatibility and payload rules

- `eventVersion` is required on every event and starts at `1`.
- Event types are additive. A breaking payload change requires a new event version and dual publishing during migration.
- `payload` may contain only typed, JSON-serialisable domain data. It must not contain credentials, cookies, authorization headers, raw prompts, complete DOM dumps, or unredacted console/network bodies.
- Evidence is referenced by immutable IDs. Clients fetch authorised evidence separately; events never embed screenshots, HAR files, or traces.
- The dashboard treats unknown event types as displayable audit entries rather than failing the stream.

```ts
type VersionedSessionEvent<T = unknown> = SessionEvent<T> & {
  eventVersion: 1;
  traceId: string;
  spanId: string;
  configVersion: string;
};
```

## 2.1 Telemetry contract

Every state transition creates a span named `sentinel.session.transition`; agent work creates `sentinel.agent.<actor>`; browser actions create `sentinel.browser.action`; and healing decisions create `sentinel.healing.decision`.

Required attributes are `sentinel.session_id`, `sentinel.capability_id` when present, `sentinel.scenario_id` when present, `sentinel.state.from`, `sentinel.state.to`, `sentinel.actor`, `sentinel.decision`, `sentinel.duration_ms`, `sentinel.config_version`, and remaining budgets. Failures set the span status to `ERROR` and attach only a redacted error class and evidence IDs.

JSON logs use the same correlation tuple: `timestamp`, `level`, `trace_id`, `span_id`, `session_id`, `event_id`, `actor`, `message`, and `attributes`. Development exports 100% of traces; production uses configurable sampling but always retains error, policy-veto, patch, and terminal-session traces. Traces and logs follow the same tenant retention policy as evidence.

## 2.2 Frozen configuration contract

Session behavior is derived from an immutable, versioned configuration snapshot stored at creation time. A run never reads mutable global configuration after `INITIALIZE`.

```ts
type SentinelConfigV1 = {
  version: "sentinel/v1";
  coverage: {
    acceptanceThreshold: number; // default 0.85, range 0..1
    maxReplanRounds: number; // default 2, range 0..2
    weights: { routes: 0.35; actions: 0.30; edge: 0.20; negative: 0.15 };
  };
  healing: {
    structuralThreshold: number; // default 0.90, range 0..1
    minimumCandidateConfidence: number; // default 0.90, range 0..1
    maxAttemptsPerStep: number; // default 1
    visualFallback: "disabled" | "allowed";
    repositoryMode: "workspace" | "pull_request";
  };
  telemetry: {
    traceSampleRate: number; // default 1 in development
    retainErrorTraces: true;
    redactKeys: string[];
  };
  exploration: {
    allowOrigins: string[];
    destructiveActions: "deny" | "disposable_only";
  };
  budgets: SessionBudgets;
};
```

The server validates the configuration with Zod, computes a SHA-256 digest, persists both snapshot and digest, and exposes only a redacted configuration view to the dashboard. Any future change uses a new version (`sentinel/v2`); it must not reinterpret historical session data.

## 3. Core types

```ts
type ScenarioClass = "happy_path" | "negative" | "boundary" | "error_state";
type SessionStatus =
  | "INITIALIZE" | "AUTHENTICATING" | "EXPLORE" | "PLAN"
  | "EVALUATE_COVERAGE" | "GENERATE_TESTS" | "EXECUTE_SUITE"
  | "TRIAGE_FAILURE" | "HEAL_LOCATOR" | "VERIFY_PATCH"
  | "PRESERVE_DEFECT" | "SYNTHESIZE_REPORT" | "COMPLETE"
  | "COMPLETE_WITH_DEFECTS" | "PARTIAL" | "ESCALATED" | "FAILED";

type DiagnosisKind =
  | "LOCATOR_DRIFT" | "ASSERTION_DRIFT" | "PRODUCT_DEFECT"
  | "ENVIRONMENT" | "FLAKY_INTERACTION" | "AMBIGUOUS";

type LocatorFingerprint = {
  strategy: "test_id" | "role" | "label" | "text" | "ancestry" | "css";
  locator: string;
  role?: string;
  accessibleName?: string;
  labels: string[];
  ancestry: string[];
  text?: string;
  stateSignature: string;
  resilience: number; // 0..1
};

type Diagnosis = {
  kind: DiagnosisKind;
  confidence: number; // 0..1
  reasons: string[];
  vetoes: HealingVeto[];
  evidenceIds: string[];
};

type TestPatch = {
  id: string;
  testPath: string;
  scenarioId: string;
  before: LocatorFingerprint;
  after: LocatorFingerprint;
  status: "PROPOSED" | "APPLIED" | "VERIFIED" | "ROLLED_BACK";
  stepVerification?: EvidenceRef;
  flowVerification?: EvidenceRef;
};
```

All public payloads are Zod-validated at the boundary. Model output is parsed into proposal schemas and cannot write files, call privileged APIs, or advance state directly.

## 4. Coverage Critic

For each capability, plans are evaluated against four scenario classes plus discovered risk signals. A plan is blocked when it lacks a required scenario class for an observed risk, lacks an error path where one is observable, contains ungrounded steps, or scores below the configured threshold.

```ts
type CoverageAssessment = {
  capabilityId: string;
  score: number; // 0..1
  gaps: Array<{
    category: "flow" | "negative" | "boundary" | "error_state" | "grounding";
    severity: "BLOCKER" | "MAJOR" | "MINOR";
    message: string;
  }>;
  decision: "ACCEPT" | "REPLAN" | "ACCEPT_WITH_RISK";
};
```

The Critic can create a `BLOCKER` only through deterministic rules. A model may identify a candidate gap but it is clamped to `MAJOR` until deterministic validation confirms it.

## 5. Healing policy

```ts
type HealingVeto =
  | "ASSERTION_CHANGED"
  | "PRODUCT_VALUE_CHANGED"
  | "MULTIPLE_CANDIDATES"
  | "STATE_MISMATCH"
  | "LOW_CONFIDENCE";
```

A patch is permitted only when:

- diagnosis is `LOCATOR_DRIFT`;
- no veto is present;
- exactly one candidate resolves in the current state;
- locator confidence meets the configured threshold;
- the patch changes only the generated test locator expression.

Any change to expected text, expected values, test data, assertions, navigation intent, or product code is blocked. A product defect is a reportable success, not a failed healing attempt.

## 6. Evidence and persistence

Store immutable evidence files by SHA-256 content digest. SQLite stores metadata and relationships, not large binary payloads.

| Evidence kind | Required for |
|---|---|
| Accessibility snapshot | exploration, locator candidate reasoning |
| Screenshot and trace | failed execution, patch verification |
| Console/network summary | environment or product diagnosis |
| Generated spec | every scenario accepted by Generator |
| Patch diff | every proposal, including rollback |
| Report JSON | every session update and terminal state |

`QualityReport` is generated from persisted session data. JSON is canonical; Markdown and HTML are renderings of that object and may not compute independent totals.

## 7. Budgets and retry behavior

```ts
type SessionBudgets = {
  maxDurationMs: number;
  maxStates: number;
  maxNavigations: number;
  maxModelCalls: number;
  maxTokens: number;
  maxReplansPerCapability: number;
  maxHealAttemptsPerStep: number;
};
```

Budgets are visible in the report. On exhaustion, AIVAR Sentinel QA stops safely and marks the session `PARTIAL`; it never reports full coverage of a partially explored target. Retry only transient browser/network failures with exponential backoff and record each retry as evidence.

## 8. CI protections

- typecheck, lint, unit tests, golden replays, and build are required checks;
- generated tests are written only beneath `tests/generated/` and CI rejects manual modifications outside Generator output commits;
- target-specific literals are prohibited in generic packages;
- credentials, evidence, SQLite databases, and Playwright output are ignored;
- dependency boundaries prevent dashboard, model adapters, and runner from importing core internals in reverse.
