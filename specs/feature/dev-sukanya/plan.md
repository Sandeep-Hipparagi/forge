# Implementation Plan — Phase 1: Spine

**Created:** 2026-09-05 05:12 UTC  
**Branch:** `feature/dev-sukanya`  
**Scope boundary:** `Ph1.1`–`Ph1.7` only; stop before `Ph2`

## Problem Statement

Build the stable spine that every later FORGE phase depends on: frozen runtime schemas, durable
SQLite/event/evidence storage, typed session and lap machines, one bounded agent-loop harness, the
real local HTTP/SSE surface, and a replay harness that drives that surface. A stubbed session must
survive process restart and terminate through the real persisted FSM.

## Architecture Decisions

1. Zod schemas are the only domain-shape source; all public TypeScript types use `z.infer`.
2. Core stays pure. Grounding and exit-code mapping are deterministic functions in core.
3. Store owns SQLite and filesystem I/O behind an explicit `Store` class; transactions allocate
   event sequence numbers and persist transitions atomically.
4. Orchestrator depends on interfaces, not a global singleton. Its event publisher runs only after
   the store transaction commits.
5. The model loop depends on an injected `ModelClient`; the Anthropic adapter remains exclusively
   inside `packages/agents/harness`.
6. Fastify is built through an application factory so integration tests use `inject()` without
   opening a port; production binding remains `127.0.0.1`.
7. Replay uses exactly two seams (`RecordedModelClient`, `ReplayToolset`) and otherwise runs the real
   API, orchestrator, and store.

## Change List

- **Create:** schema modules/tests; store migration, implementation and invariant tests;
  orchestrator guards/machines/scheduler/tests; agent harness loop/tests; API factory/routes/tests;
  replay fixtures, clients, runner and tests.
- **Modify:** package manifests/references, package exports, CLI commands, `TASKLIST.md`,
  `docs/00-work-plan.md`.
- **Dependencies:** reconcile the checked-out lockfile first; use existing Zod, Fastify,
  better-sqlite3 and Anthropic dependencies. Add type packages only if TypeScript proves they are
  required.
- **Integration points:** `@forge/core` → store/orchestrator/API/evals; store → orchestrator;
  orchestrator → API/evals; CLI → API/evals.

## Tasks

### Task 0 — Restore and prove the Phase 0 baseline

| Field  | Value                                                      |
| ------ | ---------------------------------------------------------- |
| ACs    | Phase 0 must remain green                                  |
| Tests  | `pnpm install --frozen-lockfile`; `pnpm verify`            |
| Skill  | `wex-build-and-test` (manual repository-script equivalent) |
| Status | `completed`                                                |

Install dependencies for the active `main`-derived lockfile. Do not change Phase 1 code until the
baseline either passes or any pre-existing failure is documented and corrected narrowly.

### Task 1 — Build and freeze the Zod domain model (`Ph1.1`)

| Field  | Value                                                                                    |
| ------ | ---------------------------------------------------------------------------------------- |
| ACs    | `I-13`, ID ledger, `FR-006` type boundary                                                |
| Tests  | schema round trips; ID prefix cases; grounding success/refusals; password type assertion |
| Skill  | `wex-test-generator` (manual test-first equivalent)                                      |
| Status | `completed`                                                                              |

Create cohesive modules for primitives, sessions, perception, plans, critique, laps/runs/events,
diagnosis/healing, and reports. Add `Clock`, `Rng`, `IdGen`, and `RunContext`. Implement grounding as
a pure validator that rejects unknown states and affordance references.

### Task 2 — Implement durable store and safety invariants (`Ph1.2`)

| Field  | Value                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| ACs    | `I-1`, `I-2`, `I-8`, `I-9`, `I-16`, `FR-903` persistence half                                                                          |
| Tests  | gapless append; append-only protection; full-hash collision check; traversal rejection; redaction/credential grep; evidence resolution |
| Skill  | `wex-test-generator` (manual test-first equivalent)                                                                                    |
| Status | `completed`                                                                                                                            |

Copy the specified DDL exactly, including WAL, foreign keys, `replan_rounds <= 2`, and unique
indexes. Implement session/lap persistence, atomic `appendEvent`, content-addressed evidence,
allowlisted writes, structural redaction, reads required by the API, and restart/reopen behavior.

### Task 3 — Implement all eleven typed guards and nested FSMs (`Ph1.3`)

| Field  | Value                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| ACs    | `FR-901`–`FR-905`, `TG-1`–`TG-11`, `I-4`, `I-7`, `I-11`, `I-12`, `I-15`, `FR-904`                                      |
| Tests  | one transition and refusal test per `TG-n`; illegal transition; ceilings; terminal/exits; persist-before-publish order |
| Skill  | `wex-test-generator` (manual test-first equivalent)                                                                    |
| Status | `completed`                                                                                                            |

Use closed state unions and exhaustive transition tables. Keep policy in named guard functions.
Implement serial lap scheduling with per-lap failure isolation. Persist state/event changes in one
store transaction, then publish the committed event. Resume from the last stored session/lap state.

### Task 4 — Implement the bounded model-loop harness (`Ph1.4`)

| Field  | Value                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| ACs    | `FR-906`; `EMITTED`, three ceilings, `FORCED_CLOSE`, `SCHEMA_FAILED`, `MODEL_UNAVAILABLE`                          |
| Tests  | every exit reason; two schema failures; forced-close partial output; bounded retry behavior; model-import boundary |
| Skill  | `wex-test-generator` (manual test-first equivalent)                                                                |
| Status | `completed`                                                                                                        |

Implement counter-owned termination, monotonic elapsed-time injection, one schema-repair attempt,
one forced terminal call, usage accounting, and deterministic transcript IDs. No open-ended retry or
SDK tool-runner loop.

### Task 5 — Build the Fastify API and SSE shell (`Ph1.5`)

| Field  | Value                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| ACs    | `FR-002`, `FR-003`, `FR-006`, `FR-903`; API §2/§4/§8/§9                                                              |
| Tests  | response/error contracts; password omission; automatic `TG-1` <2s; event order/replay; late join; loopback; stub E2E |
| Skill  | `wex-api-standards` (manual compliance check)                                                                        |
| Status | `completed`                                                                                                          |

Implement every endpoint group with stored projections or explicit Phase 1 empty/stub resources.
Creation returns `201` before asynchronously running the stub pipeline. SSE replays committed events
from `Last-Event-ID`, emits ordered envelopes, heartbeats while live, and closes after terminal
replay. Target/model failures remain session outcomes, not transport errors.

### Task 6 — Build the two-seam replay harness and CLI (`Ph1.6`)

| Field  | Value                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| ACs    | replay key §3.4; eval exit semantics §10.1; real-API execution                                                                   |
| Tests  | canonical key including `stateSignature` and `callIndex`; snapshot-twice case; matched session exits 0/1/2 all yield eval exit 0 |
| Skill  | `wex-test-generator` (manual test-first equivalent)                                                                              |
| Status | `completed`                                                                                                                      |

Implement canonical JSON, key derivation, strict fixture misses, case loading, `RecordedModelClient`,
`ReplayToolset`, and one Phase 1 stub case. Extend CLI commands that Phase 1 can honestly support:
`run`, `eval`, `reset`, `doctor`; keep future commands explicit stubs rather than false successes.

### Task 7 — Restart proof, freeze, and Phase 1 exit gate (`Ph1.7`)

| Field  | Value                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------- |
| ACs    | `FR-903`, `NFR-9`, complete Phase 1 exit gate                                                     |
| Tests  | kill/reopen simulation resumes same lap; reset timing; full `pnpm verify`; stub HTTP terminal run |
| Skill  | `wex-build-and-test` (manual repository-script equivalent)                                        |
| Status | `completed`                                                                                       |

Run compliance review, typecheck, lint, unit/contract/integration tests, replay eval, reset timing, and
the dependency graph. Mark only Phase 1 checkboxes complete and record schema freeze in the work
plan. Stop before any perception/exploration implementation from Phase 2.

## Requirement Coverage

| Requirement ID                          | Requirement                    | Type          | Expected implementation                  | Expected tests                      | Coverage |
| --------------------------------------- | ------------------------------ | ------------- | ---------------------------------------- | ----------------------------------- | -------- |
| `FR-901`                                | Typed finite state machine     | MUST          | session/lap transition tables            | illegal transition + `TG-1`…`TG-11` | covered  |
| `FR-902`                                | Serial capability laps         | MUST          | deterministic scheduler                  | ordering and dependency wait        | covered  |
| `FR-903`                                | Persist before emit and resume | MUST          | persisted transition writer              | ordering + reopen same state        | covered  |
| `FR-904`                                | Terminal state/exit mapping    | MUST          | `exitCodeFor()`                          | all terminal/defect combinations    | covered  |
| `FR-905`                                | Lap failure isolation          | MUST          | banked lap outcome path                  | terminal integrity                  | covered  |
| `FR-906`                                | Bounded retries/ceilings       | MUST          | `runAgentLoop()`                         | all loop exit reasons               | covered  |
| `TG-1`…`TG-11`                          | Transition guards              | Business Rule | named functions in `guards.ts`           | positive and refusal per guard      | covered  |
| `I-1`,`I-2`,`I-8`,`I-9`,`I-16`          | Store/evidence safety          | NFR           | store/event/evidence/path/redaction APIs | named invariant tests               | covered  |
| `I-4`,`I-7`,`I-11`,`I-12`,`I-13`,`I-15` | FSM/grounding integrity        | NFR           | schemas, guards and machines             | named invariant tests               | covered  |

### Uncovered Requirements

All Phase 1 requirements are covered. `FR-009` and `I-21` from open PR #1 are
not part of current `main` and are therefore not silently incorporated; they require branch-level
contract reconciliation before merge.

## Risks & Open Questions

| #   | Risk / Question                                         | Impact | Mitigation / Answer                                                                       |
| --- | ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 1   | Open PR #1 changes the schema being frozen              | High   | Implement current approved `main`; flag before merge and rebase/reconcile if PR #1 lands  |
| 2   | Current dependency install is stale after branch switch | Medium | Task 0 runs frozen install and baseline gate first                                        |
| 3   | SQLite native module portability                        | Medium | Use pinned lockfile, approved build dependency, isolated temp DB tests                    |
| 4   | SSE tests can hang                                      | Medium | Fastify injection/event queries for contracts; bounded stream test with terminal sessions |
| 5   | “Every endpoint group” can pull future logic forward    | High   | Return honest stored/empty Phase 1 projections; no Phase 2–6 algorithm implementation     |
| 6   | Schema breadth makes one giant module fragile           | Medium | Split by aggregate and export through one schema barrel                                   |

## Approval

- [x] Plan reviewed and approved by user
- [x] Open PR #1 extras deferred as an explicit merge risk, not added silently
- [x] Scope ends at the Phase 1 exit gate
