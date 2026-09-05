# 17 · API Spec

> **New.** The pre-brief set had no API document — the dashboard and the orchestrator were one process and the seam was implicit. They are two processes now ([04 §2](../02-architecture/04-system-architecture.md)), the eval harness drives the same surface a human drives ([16 §7](16-agent-test-suite.md)), and an implicit seam is a seam nobody can test.
> **This document owns:** the REST surface, the SSE envelope and its ordering guarantees, the error catalogue, the Copilot gate endpoints, and the binding and safety posture.
> **The governing sentence:** every response is a projection of a row that is already on disk. The API has no state of its own.

---

## 1. Seven principles

1. **One required input.** `POST /api/sessions` accepts `{url}` and nothing else is mandatory. `FR-001` is a contract we can point at in a schema, not a claim in a README.
2. **The API never starts a second time.** Creation *is* the start (`FR-002`). There is no `/start`, no `/run`, no confirmation step — a second call would be a second chance for a human to intervene, which is exactly what the brief's 30% asks us not to need.
3. **Persist before emit.** No event reaches the stream that is not already in `session_events` (`FR-903`). A client that saw an event and then lost the connection can always recover it by `seq`.
4. **A broken target is never an HTTP error.** The target being down, refusing login, or containing a defect are *session outcomes*, not transport failures. `4xx`/`5xx` are reserved for the API being wrong. §8 is emphatic about this.
5. **Every shape comes from `packages/core/schema`.** Responses are `z.infer` types serialised — no hand-written DTOs, no second source of truth ([05](../02-architecture/05-data-model.md)).
6. **Read-only by default.** Six of the eight verbs in this document are `GET`. The three that mutate create a session, decide a gate, or resolve an escalation — and each is a deliberate human act.
7. **A verdict has a frozen configuration.** The API resolves and persists `SessionConfigSnapshot` before it emits `session.started`. Responses expose its redacted digest and version, never mutable process configuration ([05 §2.2](../02-architecture/05-data-model.md)).

---

## 2. Surface

```
Base            http://127.0.0.1:4000/api
Content-Type    application/json; charset=utf-8
Framework       Fastify 5  ·  apps/api  ·  hosts the orchestrator and Playwright
```

**No version prefix.** `/api/v1` buys forward compatibility we will never need — this API has exactly one client we ship and one harness we own, and both are in this repository. Adding a version segment would be cargo, and the cost of adding one later is a rename. Stated so nobody adds it at hour five as a reflex.

| Group | Endpoints |
|---|---|
| Session lifecycle | `POST /sessions` · `GET /sessions` · `GET /sessions/:id` · `POST /sessions/:id/cancel` |
| Live | `GET /sessions/:id/stream` · `GET /sessions/:id/events` |
| Exploration | `GET /sessions/:id/map` · `GET /sessions/:id/capabilities` |
| Laps | `GET /sessions/:id/laps` · `GET /laps/:lapId` · `GET /laps/:lapId/plans/:round[.md]` · `GET /laps/:lapId/assessments/:round` |
| Execution | `GET /runs/:runId` · `GET /runs/:runId/steps/:stepId` |
| Decisions | `GET /diagnoses/:id` · `GET /patches/:id[.diff]` |
| Evidence | `GET /evidence/:id` · `GET /evidence/:id/raw` |
| Output | `GET /sessions/:id/report[.md|.html]` · `GET /sessions/:id/score` · `GET /sessions/:id/suite.zip` |
| Human decisions | `GET /sessions/:id/gates` · `POST /gates/:gateId` · `GET /sessions/:id/escalations` · `POST /escalations/:id` · `POST /sessions/:id/scenarios` |
| Operations | `GET /health` · `GET /doctor` |

---

## 3. Session lifecycle

### 3.1 `POST /api/sessions`

Body is `SessionInput` ([05 §2.2](../02-architecture/05-data-model.md)) — `url` required, everything else optional.

```http
POST /api/sessions
Content-Type: application/json
Idempotency-Key: 9d1c0f2a-…            # optional; replays return the original 201

{ "url": "https://shop.test",
  "username": "ada@shop.test", "password": "…",
  "prd": "# Checkout\n…", "intent": "focus on checkout and authentication",
  "mode": "autopilot",
  "budget": { "maxCapabilities": 20, "maxDurationMs": 1800000, "maxUsd": 2.0 } }
```

```http
201 Created
Location: /api/sessions/ses_01j9x2k4

{ "id": "ses_01j9x2k4", "status": "CREATED",
  "input": { "url": "https://shop.test", "username": "ada@shop.test",
             "intent": "focus on checkout and authentication",
             "mode": "autopilot", "budget": { … } },
  "authenticated": false, "exitCode": null, "defectsFound": 0,
  "createdAt": "2026-01-01T00:00:00.000Z", "finishedAt": null,
  "stream": "/api/sessions/ses_01j9x2k4/stream" }
```

Three properties of that exchange are requirements, not conveniences.

**`password` is absent from the response, and from everything downstream.** `Session.input` is typed `SessionInput.omit({ password: true })`, so the credential is accepted at the boundary, used to produce `storageState`, and then it is *structurally impossible* for it to reach a stored row, an event payload, or a serialised response (`FR-006`, `I-16`). A rule enforced by a type beats a rule enforced by a code review at hour six.

**The `201` returns before exploration starts, and exploration starts anyway.** `TG-1` fires within 2 s of the response, with no further request (`FR-002`). The client learns about it from the stream. This is the shape of the brief's clause `M1`, and `EC-01` asserts the 2 s.

**`Idempotency-Key` exists for one reason:** the dashboard's submit button, pressed twice on a slow venue network, must not start two crawls against somebody else's application. A replayed key returns the original `201` unchanged for 24 hours.

### 3.2 `GET /api/sessions/:id`

Returns the `Session` plus a rollup the dashboard needs on every poll: current lap index, backlog length, banked count, defect count, live usage and cost.

### 3.3 `POST /api/sessions/:id/cancel`

Graceful only. The current lap banks what it has as `PARTIAL`, the report is generated over everything banked, and the session terminates `COMPLETED_PARTIAL` with exit 0. There is no forced kill in the API, because there is no state a forced kill would protect — every transition is already on disk.

Cancelling a session already in a terminal state returns `409`.

---

## 4. The event stream

### 4.1 `GET /api/sessions/:id/stream`

```
Content-Type: text/event-stream
Cache-Control: no-store
X-Accel-Buffering: no
```

```
retry: 2000

id: 412
event: heal.decided
data: {"seq":412,"sessionId":"ses_01j9x2k4","lapId":"lap_01j9x2k9",
       "at":"2026-01-01T00:03:11.402Z","actor":"healer","type":"heal.decided",
       "payload":{"stepId":"s4","decision":"AUTO_HEAL","score":0.891,
                  "margin":0.091,"vetoes":[],"strategy":"role_name"}}

: heartbeat
```

The `data` object is a `SessionEvent` verbatim ([05 §2.8](../02-architecture/05-data-model.md)) — the same row the store holds and the same enum the log file uses. **One event vocabulary for the log, the stream and the dashboard** means a `grep` in the terminal and a filter in the UI find the same thing.

| Guarantee | How |
|---|---|
| **Ordered** | `seq` is monotonic and gapless per session, assigned by the store, not by the emitter |
| **Never ahead of disk** | The event is written before it is published (`FR-903`) |
| **Resumable** | `Last-Event-ID: 412` replays from 413 without a refetch |
| **Late-joiner safe** | Connecting after the session finished replays the whole log, then closes |
| **Alive** | A `: heartbeat` comment every 15 s, so a proxy cannot silently drop an idle stream |
| **Bounded** | Payloads carry ids, never blobs. A DOM snapshot is `evidenceId`, fetched separately |
| **Fast** | Published within **300 ms** of occurring (`P-5`, `FR-504`) |

### 4.1.1 Compatibility and correlation

Every event carries `id`, `eventVersion: 1`, `traceId`, `spanId`, `configSha256`, and `evidenceIds`. Delivery is at-least-once: the dashboard deduplicates by `id`, then uses `seq` to detect and recover gaps. Event types are additive; a breaking payload change increments the version and dual-publishes for the migration window. Unknown event types render as neutral audit rows.

The API emits a correlation-safe JSON log and trace for every transition, agent call, browser action, and healing decision. Required fields are `sessionId`, `eventId` when present, actor, decision, duration, remaining budgets, `configSha256`, and evidence IDs. Error records carry a redacted error class, never raw target data or credentials. During the local MVP all traces are retained; any hosted mode must define retention and sampling policy before it is enabled.

**Why SSE and not WebSockets.** The traffic is one-directional: the orchestrator narrates, the dashboard listens. Human decisions are rare, deliberate, and better as `POST`s that return a status than as messages into a socket with no response semantics. SSE also reconnects and replays by `id` for free, which is the exact behaviour a flaky venue network needs. A WebSocket would add a second protocol, a heartbeat we write ourselves, and a reconnection story we would have to test — for nothing.

### 4.2 `GET /api/sessions/:id/events?since=<seq>&limit=200`

The polling fallback and the gap-recovery path. A client that receives `seq` 414 after 412 fetches `?since=412` and reconciles rather than rendering a hole ([18 §7](18-ui-spec.md)). Returns `{ events: SessionEvent[], nextSince, hasMore }`.

This endpoint is also what makes the dashboard restartable mid-run: fetch the session, fetch the events, subscribe. Three calls and the UI is exactly where the orchestrator is.

---

## 5. Reading the pipeline

| Endpoint | Returns | Why the dashboard needs it |
|---|---|---|
| `GET /sessions/:id/map` | `CapabilityMap` — states, transitions, affordances, `frontier.haltReason` | The map view, and the honesty constraint on the report |
| `GET /sessions/:id/capabilities` | `Capability[]` in `priorityRank` order, each with all six `RiskFactors` | The backlog panel — *why* checkout is first |
| `GET /laps/:lapId` | `Lap` with `replanRounds`, `healAttempts`, `acceptedRisk`, outcome | The lap timeline |
| `GET /laps/:lapId/plans/:round` | The `TestPlan` for that round — **rounds are kept, not overwritten** | The re-plan diff: round 0 beside round 1 |
| `GET /laps/:lapId/plans/:round.md` | `text/markdown` — the human artefact (`FR-202`) | A QA lead reads it without tooling |
| `GET /laps/:lapId/assessments/:round` | `CoverageAssessment` — score, the five structural terms, gaps, residual gaps, verdict, source | The coverage panel; the *reason* a plan was sent back |
| `GET /runs/:runId` | `Run` with steps, statuses, verification | The run timeline |
| `GET /diagnoses/:id` | `Diagnosis` plus its `HealCandidate[]` with all six sub-scores | The decision inspector's table |
| `GET /patches/:id` · `.diff` | `TestPatch` · the unified diff as `text/plain` | *"Show me the diff"*, live |

**`plans/:round` is the endpoint the innovation score depends on.** Round 0 is the plan the Critic rejected, and it is retained precisely so the dashboard can put it beside round 1. An API that only exposed the current plan would make the brief's `M4` invisible — the orchestrator would still have changed its mind, and nobody could see it.

### 5.1 Evidence

```http
GET /api/evidence/ev_01j9x3ab            → the Evidence row: type, label, bytes, sha256, path
GET /api/evidence/ev_01j9x3ab/raw        → the bytes, with the right Content-Type
                                           ETag: "sha256-<full hash>"
                                           Cache-Control: public, max-age=31536000, immutable
```

Evidence is content-addressed and immutable (`FR-505`, `I-2`), so `immutable` is a true statement about the resource rather than a caching guess. The `ETag` is the content hash, which means *"this artefact cannot be quietly revised — the hash would change"* is a claim a judge can verify with `curl -I`.

`storageState` is never an evidence row and has no endpoint. It holds live session cookies ([09 §2.3](../03-algorithms/09-exploration-and-prioritisation.md)).

### 5.2 Output

| Endpoint | Returns |
|---|---|
| `GET /sessions/:id/report` | `QualityReport` JSON — the five mandated contents plus defects, score, hoursSaved |
| `GET /sessions/:id/report.md` · `.html` | The same document rendered (`FR-805`); the HTML is self-contained and prints cleanly |
| `GET /sessions/:id/score` | `RobustnessScore` — `current`, `projected`, every component, per-capability, findings |
| `GET /sessions/:id/suite.zip` | The portable Playwright project (`FR-405`) — the thing a team actually keeps |

A report exists from the first banked lap onward, because `buildReport()` is a pure function of stored rows and is regenerated after every lap ([14 §1.1](../03-algorithms/14-quality-report-and-score.md)). **Requesting the report of a running session returns a complete, honest report of what has been banked so far** — not `409`, not a partial object. Kill the process at 40% and there is a real report covering 40%.

---

## 6. Human decisions

Two kinds, and they are different enough to deserve different endpoints.

### 6.1 Copilot gates (`FR-907`, `FR-908`, `FR-909`)

Gates exist only in `mode: "copilot"`, and only **between** laps — never inside one ([01 §6](../01-foundation/01-vision-and-scope.md)). In autopilot, `GET /gates` always returns an empty array; nothing pauses, ever.

```http
GET  /api/sessions/:id/gates
→ [{ "id": "gat_01j9x3c1", "kind": "LAP_BOUNDARY", "tier": "BLOCKING",
     "openedAt": "…", "nextCapability": { "id": "cap_…", "name": "Checkout" },
     "context": { "bankedLaps": 2, "remaining": 3 } }]

POST /api/gates/gat_01j9x3c1
{ "decision": "approve" }
{ "decision": "reject",     "reason": "skip admin for now" }
{ "decision": "reprioritise", "capabilityIds": ["cap_b", "cap_a", "cap_c"] }
```

| Tier | Behaviour | Example |
|---|---|---|
| `AUTO` | Approved on creation; recorded, never blocks | A reversible read |
| `NOTIFY` | Emits an event, continues immediately | An impactful but recoverable action |
| `BLOCKING` | Waits for a decision | An irreversible action, or a lap boundary in Copilot |

Uniform gating is how human-in-the-loop products get abandoned. Only irreversible things block, and only when a human asked for the wheel.

`POST /api/sessions/:id/scenarios` injects a human-authored scenario into the next lap's plan. It is critiqued, generated and run exactly like any other, carrying `source: "human"` — the agent does the volume, the human adds the judgement.

### 6.2 Escalations

An escalation is not a gate. It is a **terminal outcome of a lap** that carries a complete evidence pack ([13 §14.2](../03-algorithms/13-triage-and-healing.md)); the session has already moved on.

```http
GET  /api/sessions/:id/escalations
→ [{ "id": "esc_…", "diagnosisId": "dg_…", "reason": "AMBIGUOUS", "veto": "V4",
     "question": "Is getByRole('button', {name:'Confirm order'}) the same control as 'Place order'?",
     "candidates": [ …top two, all six sub-scores… ],
     "wouldBeDiff": "--- a/tests/generated/checkout.spec.ts\n+++ …",
     "crops": { "fingerprint": "ev_…", "candidate": "ev_…" } }]

POST /api/escalations/esc_…
{ "decision": "apply" }                          → patch, verify (TG-10), rollback on failure
{ "decision": "reject", "reason": "different button" }
```

Applying an escalation goes through the **same** patch → verify → rollback path as an automatic heal. A human's approval buys the decision, never the verification. That is the difference between a review tool and a rubber stamp.

---

## 7. Operations

```http
GET /api/health   → { "ok": true, "uptimeMs": 91204, "activeSessions": 1 }
GET /api/doctor   → { "ok": false, "checks": [
     { "id": "node",     "ok": true,  "expected": "22.11.0",  "actual": "22.11.0" },
     { "id": "chromium", "ok": false, "expected": "1148",     "actual": "1151",
       "hint": "pnpm exec playwright install chromium" },
     { "id": "model",    "ok": true,  "expected": "claude-opus-5", "actual": "reachable" },
     { "id": "safety",   "ok": true,  "detail": "allowlist unchanged; bind is loopback" } ] }
```

`GET /doctor` returns **200 with `ok: false`** on drift. A failing diagnostic is a successful diagnosis, and returning `503` would mean a monitoring tool could not tell "the doctor says the browser is wrong" from "the doctor is down". The CLI's exit code carries the failure; the endpoint carries the finding.

---

## 8. Errors

```jsonc
{ "error": {
    "code": "VALIDATION_FAILED",
    "message": "url must be a valid http(s) URL",
    "issues": [ { "path": ["url"], "code": "invalid_string", "message": "Invalid url" } ],
    "requestId": "req_01j9x2k3" } }
```

| Status | Code | When |
|---|---|---|
| `400` | `VALIDATION_FAILED` | Zod rejected the body. `issues[]` is the Zod issue list, verbatim (`FR-001`) |
| `400` | `HOST_NOT_ALLOWED` | The URL's host fails `FORGE_ALLOWED_HOSTS` — a safety refusal, stated as one (`TG-1`) |
| `404` | `NOT_FOUND` | No such session, lap, run, diagnosis or evidence id |
| `409` | `INVALID_STATE` | Cancelling a terminal session; deciding a gate twice; resolving a closed escalation |
| `409` | `MUTATION_CONFLICT` | Two conflicting defects on the bundled target ([19 §5.2](19-target-apps.md)) |
| `413` | `PAYLOAD_TOO_LARGE` | A PRD over 200 KB |
| `429` | `TOO_MANY_SESSIONS` | More concurrent sessions than the process will run |
| `500` | `INTERNAL` | Our bug. Carries `requestId`, and the same id appears in the log line |

### 8.1 The statuses that are deliberately absent

This is the most important table in the document, and it is a list of things that are **not** errors.

| Situation | Not this | Actually this |
|---|---|---|
| The target is unreachable | `502` | `201`, then the session reports `ENVIRONMENT` with evidence |
| The target refuses our credentials | `401` | `201`, then `authenticated: false` and a smaller, honestly-labelled map |
| The model API is down | `503` | `201`, then the deterministic critic and classifier; `source: "deterministic"` (`NFR-2`) |
| The application under test has a real bug | `500` | `200` everywhere, `defectsFound: 1`, and **exit code 1** — a successful run |
| A lap failed | anything | `200`; the lap banks `LAP_FAILED` and the session continues (`FR-905`) |

**Confusing "the thing we are testing is broken" with "we are broken" would be the single most damaging bug this project could ship**, because it is the exact confusion the product exists to eliminate. Encoding it in HTTP status codes would put that confusion in the transport layer, where no veto can reach it.

---

## 9. Binding, safety and what this API is not

```
FORGE_API_BIND=127.0.0.1     # loopback by default
FORGE_API_PORT=4000
```

**No authentication, and loopback binding instead.** An auth layer on a single-user local tool is theatre: it adds a login screen no judge scores, a secret to leak, and a false sense that the surface is safe to expose. Binding to loopback is a stronger guarantee than a bearer token, because it is enforced by the kernel rather than by our middleware. `forge doctor` fails if the bind address is not loopback while `SUT_CONTROL_ENABLED=true`, so the defect-injection plane and a network-reachable API can never be true at once ([15 §7](15-repo-and-conventions.md)).

CORS allows exactly one origin: `http://localhost:${FORGE_WEB_PORT}`. The compose file sets both.

| Not building | Why |
|---|---|
| Auth, users, tenancy | Local-first, single user ([ADR-015](../decisions/ADR-015-deployment.md)). Zero rubric weight, real cost |
| WebSockets | §4.1 — one direction, and SSE replays by id for free |
| GraphQL | Nine resources, one client, one harness. A schema layer would be pure ceremony |
| Webhooks / callbacks | Nothing to call back to. CI reads the exit code and the report file |
| Pagination on most collections | A session has ≤ 20 capabilities and ≤ 60 scenarios. Only `/events` pages, because it is unbounded |
| An `/api/v1` prefix | §2 |

---

## 10. Budgets

| Endpoint class | p50 | Cap | Note |
|---|---|---|---|
| `POST /sessions` | 25 ms | 200 ms | Validation and one insert; exploration is asynchronous |
| Any `GET` of a stored row | 8 ms | 100 ms | Indexed reads; `P-4` gives the UI 100 ms end to end |
| `GET /evidence/:id/raw` | 15 ms | 300 ms | Streamed from the content-addressed store |
| `GET /report.html` | 60 ms | 500 ms | Pure render over stored rows |
| SSE publish latency | 40 ms | **300 ms** | `P-5`, `FR-504` — measured from store write to client receipt |
| `GET /suite.zip` | 200 ms | 2 s | Zipped from disk, never regenerated |

The report endpoints are fast because the report is a pure function of rows that already exist. Nothing in this API computes; it projects.

---

## 11. Related documents

- The entities every response projects → [05 · Data Model](../02-architecture/05-data-model.md)
- The states the stream narrates → [04 §3](../02-architecture/04-system-architecture.md)
- What consumes this surface → [18 · UI Spec](18-ui-spec.md)
- What tests it → [16 §7](16-agent-test-suite.md)
- The report and score it serves → [14](../03-algorithms/14-quality-report-and-score.md)
- Why it is loopback and local-first → [ADR-015](../decisions/ADR-015-deployment.md)
