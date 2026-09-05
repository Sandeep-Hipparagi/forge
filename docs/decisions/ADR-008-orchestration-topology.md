# ADR-008 · One orchestrator FSM with logical modules, not four autonomous agents

| | |
|---|---|
| **Status** | **Amended by [ADR-011](ADR-011-agent-topology.md)** on 4 Sep 2026 — its reasoning stands; its scope narrows to the stages that produce a verdict. Exploration faces an open world and is agentic. |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P1 (orchestrator owner) · all consulted |
| **Requirements** | NFR-1, NFR-3, NFR-4, FR-407, FR-408 |
| **Governs** | [04 §1–3](../02-architecture/04-system-architecture.md) · [01 §4](../01-foundation/01-vision-and-scope.md) |
| **Related risks** | [RK-12](../05-delivery/23-risk-register.md) |

---

## 1. Context

FORGE has four named modules — Argus (vision), Daedalus (design), Hephaestus (healing), Forge (orchestrator). The naming invites an architecture: four autonomous LLM agents, each owning its domain, coordinating over a message bus. That is the shape most multi-agent demos take in 2026, and it is what an audience expects when they hear four mythological names.

The question is whether the module boundary should also be a **process and reasoning boundary**.

---

## 2. The two options

### Option A — Four autonomous agents

Each module is an agent with its own model loop, tools and prompt. They negotiate: the vision agent reports what it sees, the healing agent proposes a repair, the orchestrator agent adjudicates.

### Option B — One orchestrator process, four logical modules *(chosen)*

A 15-state finite state machine in `packages/agent` drives everything. The modules are packages with enforced import boundaries, not actors. Three OS processes total — `web` (rendering only), `api` (orchestration, Playwright, persistence, model calls), `sut` — and the split among those three is about **blast radius**, not about reasoning.

### Comparison

| Criterion | A · four agents | B · one FSM |
|---|---|---|
| Determinism (NFR-1) | None — negotiation order varies | Every transition enumerated and logged |
| Latency for one heal cycle | Many inter-agent round trips; 30 s+ | ~6 s, one model call inside it |
| Cost per cycle | Multiplied by agent count | ≈$0.20 |
| Debugging a wrong verdict | Read a transcript, infer intent | Read a state and its inputs |
| Resume after a mid-run crash | Effectively impossible | Every transition is written before it is emitted; the timeline resumes from SQLite |
| Enforcing "2 heals per step, 3 per run" (FR-408) | A prompt instruction agents may ignore | A counter (I-4) |
| Enforcing "no `VERIFIED` without full-flow re-run" (FR-407) | A convention | An invariant (I-7) |
| Testable without a browser or a model | No | Yes — `core` has zero I/O |
| Parallel work for a team of five | Needs the process split | Comes from **package** boundaries, not process boundaries |
| Sounds impressive in a pitch | Higher | Lower — until the second question |

---

## 3. Decision

**Option B.** The mythological names live in the dashboard and the pitch; the code uses `vision`, `design`, `healing`, `orchestrator` so a newcomer can navigate without a classics degree.

The decisive observation is that **multi-agent is precisely the wrong architecture for a system whose value proposition is auditability.** Every property we sell — deterministic verdicts, an append-only event log, arithmetic a judge can check, hard limits that cannot be talked around — is a property of a state machine and is not a property of a negotiation. Option A would have us claiming rigour in a topology that structurally cannot provide it.

Two supporting points, both easy to miss:

1. **The parallelism argument for multi-agent does not apply here.** Five people work simultaneously because of the dependency rule (`core → nothing`, `runner → core`, `api → agent → {core, runner, store}`), enforced by `dependency-cruiser`. Package boundaries bought the parallelism; process boundaries would have bought nothing extra and cost determinism.
2. **The three-process split we *do* have is about failure isolation, not reasoning.** `apps/sut` is separate because the demo's most dramatic beat is mutating the product live, and mutating a process that shares memory with the orchestrator would be reckless. `apps/web` is separate because a UI crash must not touch a run.

Constraints then become code rather than instructions: FR-408's caps are counters, FR-407 is a guard on the terminal transition, and every state change is an append-only event with a timestamp and an actor (NFR-4).

---

## 4. Consequences

**What we accept**

- FORGE cannot improvise a path the FSM does not have. A novel situation escalates instead of adapting.
- Fifteen states must be understood as a whole by whoever changes them.
- The pitch has to earn attention with the *refusal*, not with the architecture diagram.

**What it buys**

- Exit codes carry meaning: `0` verified, `1` a proven defect, `2` escalated, `3` harness failure — and CI treats `1` as a valid outcome, because a correct `PRODUCT_BUG` is a successful run.
- A mid-run API restart resumes rather than loses the timeline.
- The decision layer is unit-testable with no browser and no model, which is what makes RK-12's contingency (swarm on the FSM) feasible at all.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| The loop does not close on D-6 — no heal, therefore no demo | RK-12 · 6 | Every input to M5 lands a day early by design; T-411/T-412 are the only genuinely new code. Contingency: the one all-hands swarm the plan permits |
| The FSM grows states under time pressure until nobody holds it in their head | not registered | §7's 25-state trigger. States are cheap to add and expensive to own |
| "Not multi-agent" reads as unambitious to a non-technical judge | not registered | The mythology stays in the UI; the loop is narrated as eight steps, not fifteen states |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | The problem decomposes into a fixed pipeline | It does for our loop (Understand → Test → Fail → Diagnose → Decide → Heal → Re-run → Prove). It stops being true the moment a step must decide to *go back and re-plan* | The FSM needing a transition nobody enumerated. **Treat that as a signal about the problem, not a bug to patch** — it is the first real evidence that a bounded agent loop belongs somewhere |
| A2 | Fifteen states is close to complete | If states keep accreting, the FSM becomes a graph with the same opacity as an agent transcript and none of the flexibility | Count the states at each milestone. A cheap metric nobody currently tracks |
| A3 | Restart-resume actually works | It depends on *every* transition being written before it is emitted. One `emit`-then-`write` ordering mistake breaks it silently, and only under a crash | The restart drill in [22 · Demo Runbook](../05-delivery/22-demo-runbook.md) is manual, so automate it in the `Ph1` fixture harness; the invariant list must also cover write-before-emit |
| A4 | Co-locating orchestration and Playwright in one process is fine | A Chromium crash takes the API with it if the runner is not isolated well. Today it is a caught error and a recycled context (RK-06) | Any run where an `ERROR` verdict is accompanied by an API restart |
| A5 | Module boundaries hold without process boundaries | `dependency-cruiser` enforces imports, not discipline. `core` importing `runner` is a build failure; `core` *reimplementing* a runner concern is not | Growth of `core`'s surface area. The rule that keeps this honest is that `core` has zero I/O |
| A6 | One run at a time is sufficient | True for a demo. False for any hosted use, and the FSM's in-process assumptions would need revisiting before that | Any requirement to run two targets concurrently |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| The FSM exceeds ~25 states, or gains a state whose *transitions* depend on model output | Consider a bounded agent loop **for that sub-problem only** — most likely flow re-planning ([ADR-006 §7](ADR-006-spec-as-source-of-truth.md)). The outer machine stays deterministic |
| Many targets must run concurrently | Split `runner` into worker processes with the FSM as coordinator. This is a **scaling** split, not a topology change, and it does not reopen this ADR |
| A2 fails and state count balloons | Refactor into nested machines (execute / diagnose / heal as sub-machines) before considering agents. Hierarchy first, autonomy last |
| A judge or a market demands multi-agent language | Change the vocabulary in the pitch, not the architecture. The four names already exist in the UI for exactly this reason |
| A3's crash-resume test fails | Fix the write-then-emit ordering. Do **not** relax NFR-4's append-only guarantee to make resumption easier |

---

## 8. Related

- [ADR-002 · LLM role](ADR-002-llm-role.md) — what the FSM calls the model *for*
- [ADR-005 · Persistence](ADR-005-persistence.md) — the write-before-emit property resume depends on
- [ADR-009 · Frontend transport](ADR-009-frontend-transport.md) — how FSM transitions reach the UI
- [04 §1–3](../02-architecture/04-system-architecture.md) — process topology, package map, the state diagram
