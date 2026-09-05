# Architecture

## 1. System shape

```text
Dashboard / CLI
      │ REST + SSE
API + Orchestrator ──► SQLite metadata + content-addressed evidence
      │                         ▲
      ├── Explorer / Planner / Critic / Generator / Triage (typed proposals)
      └── Playwright Runner ────┘
                    │
                Target web app
```

The Orchestrator is the product. Sub-agents never call each other directly and never mutate persistent state. They receive a typed packet and return a typed proposal; the orchestrator validates, persists, and advances the state.

## 2. Canonical workspace

```text
apps/
  api/                 Fastify API, SSE, orchestration host
  web/                 Next.js Mission Control dashboard
  sut/                 Deterministic mutable demo target
packages/
  core/                Zod schemas, scoring, compiler, reports, pure rules
  perception/          Accessibility snapshots, affordances, state signatures
  agents/              Explorer, Planner, Critic, Generator, Triage adapters
  orchestrator/        Session and capability-lap finite-state machines
  runner/              Playwright execution, evidence, patch verification
  store/               SQLite metadata and evidence index
  evals/               Replay fixtures, mutation fixtures, golden cases
  cli/                 forge commands
artifacts/             Runtime-only evidence; gitignored
```

## 3. Session state machine

```text
INITIALIZE → AUTHENTICATING? → EXPLORE → PLAN → EVALUATE_COVERAGE
  → GENERATE_TESTS → EXECUTE_SUITE → TRIAGE_FAILURE
      ├─ HEAL_LOCATOR → VERIFY_PATCH ───────────────┐
      └─ PRESERVE_DEFECT ───────────────────────────┤
                                                  SYNTHESIZE_REPORT
                                                      ├─ COMPLETE
                                                      ├─ COMPLETE_WITH_DEFECTS
                                                      ├─ PARTIAL / ESCALATED
                                                      └─ FAILED
```

Every transition is guarded, persisted, and emitted after persistence. These names are the canonical `SessionStatus` enum; API payloads, events, dashboard views, and implementation code must use them verbatim. A completed run that finds a genuine defect ends as `COMPLETE_WITH_DEFECTS` and exits with a distinct non-zero CI code while preserving its successful detection status in the report.

## 4. Data contracts

The core package owns these Zod schemas: `Session`, `Capability`, `State`, `Scenario`, `TestPlan`, `CoverageAssessment`, `Evidence`, `Diagnosis`, `LocatorFingerprint`, `TestPatch`, and `QualityReport`.

Required invariants:

- generated test files are linked to a scenario and generator decision;
- a patch is immutable and contains before/after locators plus verification evidence;
- a report is a pure projection of persisted session data;
- a defect cannot be overwritten by a healing result;
- events have monotonic sequence numbers per session.

## 5. Perception and locators

Accessibility snapshots are the primary perception primitive. Candidate locators are ranked in this order:

1. stable test ID;
2. accessible role and name;
3. associated label;
4. semantic text scoped to a meaningful region;
5. stable ancestry and structural attributes.

Raw CSS/XPath is a last resort and receives low resilience trust. Screenshot or geometry data may corroborate a candidate; it is not a substitute for deterministic evidence.

## 6. Healing protocol

1. Capture failure signature, current state, evidence, and original locator fingerprint.
2. Deterministically pre-classify the failure.
3. Apply product-safety vetoes before proposal generation.
4. Rank locator candidates and require a configured confidence threshold.
5. Write a minimal test patch and rerun the failed step.
6. Rerun the complete scenario.
7. Retain verified patch or roll back and escalate.

## 7. Security and operations

- Encrypt or ephemeral-store credentials; redact them from events, traces, and reports.
- Bind local demo services to loopback by default.
- Block destructive actions through a deny-list unless the target profile is disposable.
- Apply per-session duration, navigation, model-call, token, and retry budgets.
- Support offline replay with recorded agent proposals and browser tapes.
