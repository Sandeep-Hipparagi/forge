# ADR-005 · SQLite for state, content-addressed filesystem for evidence

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P2 (store owner) · P1, P5 consulted |
| **Requirements** | FR-206, FR-410, NFR-4, NFR-5, NFR-9 |
| **Governs** | [05 §3–4](../02-architecture/05-data-model.md) · [04 §6](../02-architecture/04-system-architecture.md) |
| **Related risks** | [RK-07](../05-delivery/23-risk-register.md) |

---

## 1. Context

A run produces two very different kinds of output:

- **Small structured facts** — runs, events, diagnoses, candidates, patches, fingerprints, findings. Queried, joined, filtered by the dashboard.
- **Large opaque payloads** — DOM snapshots, screenshots, crops, diff images, `trace.zip`. Written once, read by id, never queried.

Three requirements shape the storage choice more than volume does. `run_events` must be append-only with a gapless per-run sequence (I-1, NFR-4). Evidence must be immutable and content-addressed (FR-206). And `historical` scoring needs *the last 10 fingerprints for a `(specId, stepId)` pair across all previous runs* (FR-410) — a join across time, not a lookup within a run.

---

## 2. The two options

### Option A — JSON files on disk

One directory per run, one JSON file per entity, or a single append-only JSONL log. Zero dependencies, no native module, trivially diffable, obviously resettable.

### Option B — SQLite + content-addressed evidence FS *(chosen)*

`better-sqlite3` in WAL mode at `artifacts/forge.db` for metadata, with a `doc_json` column alongside extracted indexable columns. Payloads live at `artifacts/runs/<runId>/<kind>/<sha256[0:12]>.<ext>` with a `manifest.json` mapping `evidenceId → {path, type, sha256, bytes, capturedAt}`.

*(Postgres was considered and rejected in one line: a container dependency on demo day for a single-laptop application.)*

### Comparison

| Criterion | A · JSON files | B · SQLite + CAS |
|---|---|---|
| "Last 10 fingerprints for `(spec, step)` across runs" (FR-410) | Scan every run directory and parse | One indexed query |
| Dashboard joins (diagnosis → candidates → evidence) | Hand-rolled in application code | SQL |
| Atomic state transition (write, then emit) | Not atomic — a crash mid-write leaves a torn file | A transaction |
| Gapless `seq` per run (I-1) | Application-enforced, racy under two writers | Enforced at insert |
| Concurrent reader (UI) + writer (evals) | File locking, or corruption | WAL: readers never block the writer |
| Native module risk across three OSes | **None** | Real — `better-sqlite3` must build or find a prebuild |
| Diffable in git / greppable at 2am | **Excellent** | Needs a CLI |
| Reset in under 20 s (NFR-9) | `rm -rf artifacts/` | `rm -rf artifacts/` — identical |
| Schema evolution during a 10-day build | Free | Free via `doc_json`, with migrations for indexed columns |

---

## 3. Decision

**Option B**, split by payload kind, behind a `store` interface rather than scattered SQL.

**Why SQLite for metadata.** FR-410 decides it. `historical` is the signal that makes the second heal of an element more confident than the first, and it requires reading *across* runs. Under Option A that is a directory scan whose cost grows with every eval loop we run — and we run a lot of them. Everything else (transactions, WAL, gapless sequences, the dashboard's joins) is confirmation.

**Why the filesystem for payloads, rather than BLOBs in the same database.**

1. **Deduplication is free.** Identical DOM snapshots across heal attempts store once. During a healing run that is most of the bytes.
2. **Immutability is structural, not policed.** Rewriting content produces a different path. Nothing has to enforce it (I-2).
3. A 5 MB `trace.zip` in a row makes every query slower and the database awkward to reset in place.
4. `artifacts/runs/<runId>/` is directly inspectable with `ls` and `open` at 2am on D-1. That is worth more than it sounds.

**Why `doc_json` alongside real columns.** Schema evolution for free during a two-week build: add a field to the Zod schema, no migration. The rule that keeps it honest is in [05 §3](../02-architecture/05-data-model.md) — *never read a value from a JSON column that also exists as a real column.* The column is authoritative for queries; the JSON is for reconstruction.

---

## 4. Consequences

**What we accept**

- A native module on the critical path (see A1 below).
- One writer at a time. WAL gives concurrent reads, not concurrent writes.
- State is not human-diffable without a CLI. `pnpm forge` subcommands cover the cases we actually need.

**What it buys**

- NFR-4's auditability is a table property, not a discipline: `run_events` has no `UPDATE` path.
- A mid-run API restart resumes the timeline from SQLite, because every transition is written before it is emitted ([04 §8](../02-architecture/04-system-architecture.md)).
- FR-206 is satisfied by construction rather than by a check.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| SQLite lock contention between the eval harness and the live UI | RK-07 · 1 · accepted | WAL mode, 5 s busy timeout. Contingency: restart `dev:api`; state survives |
| `better-sqlite3` fails to build on a demo machine | not registered — **should be** | See A1 and §7 |
| Artifacts grow unbounded across eval loops | not registered | `forge reset` between runs; pruning is a §7 trigger, not a D-10 feature |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | Prebuilt `better-sqlite3` binaries exist for pinned Node 22.11 on every machine (macOS, Linux, Windows 11) | The prototype loses time to node-gyp on a fresh machine | `forge doctor` verifies the DB schema ([15 §6](../04-build/15-repo-and-conventions.md)); the pre-flight check is part of [20 · Execution Plan](../05-delivery/20-execution-plan.md) and runs before implementation |
| A2 | There is effectively one writer | The eval harness and the API both write. Overlap yields `SQLITE_BUSY`, absorbed by the 5 s timeout today. **Parallel eval shards would break this outright** | `SQLITE_BUSY` appearing in logs during a normal run rather than during a deliberate collision |
| A3 | Content-addressing gives immutability | It gives immutability of *content*, not protection from *deletion* — nothing stops `rm -rf`. The defensible claim is "evidence cannot be silently revised", **not** "evidence cannot be destroyed" | Nothing detects it. This is a precision-of-language issue: overclaiming to a judge is worse than the limitation itself |
| A4 | A 12-hex-character prefix (48 bits) is collision-free at our scale | Fine for hundreds of artifacts; uncomfortable at 10⁶. A silent collision would serve the wrong evidence for a cited id — an audit failure of the worst kind | `store.putEvidence()` must compare the **full** hash on a prefix hit and never assume equality from the prefix. Cheap now, unfixable later |
| A5 | `artifacts/` is disposable | If someone needs a three-day-old run to defend a claim and `reset` deleted it, there is no recovery | The `pre-event` and freeze tags cover code, not artifacts. Archiving a rehearsal's `artifacts/` before reset is a one-line habit worth having on D-2 |
| A6 | The `store` interface is a genuine seam | If SQL leaks into `packages/agent`, the JSON-store fallback in §7 stops being half a day and becomes a rewrite | `dependency-cruiser` enforces the import graph; it does not enforce that SQL stays inside `store`. A grep for `SELECT` outside `packages/store` in CI would |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| The native module fails to install on a demo machine on D-2 or later | Fall back to a JSON-file implementation **behind the same `store` interface**. Cost ≈ half a day; `historical` degrades from an indexed query to a scan, which is acceptable at demo scale. This is the entire reason `store` is an interface |
| Eval shards run in parallel | One database per shard, merged for reporting — or Postgres. Do not raise the busy timeout and hope |
| Runs must be shared across machines or published as CI artifacts | Move payloads to object storage, keep SQLite for metadata. The CAS layout ports directly |
| `artifacts/` exceeds ~2 GB on a laptop | Prune whole runs oldest-first, keeping `manifest.json`, so citations resolve to a tombstone rather than to nothing |
| Any need for multi-user or hosted operation | This ADR is void — Postgres plus object storage, and the append-only guarantees must be re-established, not assumed |

---

## 8. Related

- [ADR-008 · Orchestration topology](ADR-008-orchestration-topology.md) — why "write before emit" makes restart-resume possible
- [05 · Data model](../02-architecture/05-data-model.md) — the DDL and invariants I-1, I-2, I-9
- [04 §6](../02-architecture/04-system-architecture.md) — the artifacts layout and reset semantics
