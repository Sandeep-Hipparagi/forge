# FORGE · Task List

> **What this is.** The step-by-step build order for the implementation, cut into checkpoints small enough to verify one at a time. It carries **no specification detail** — every task points at the document that owns the answer.
> **What this is not.** A status tracker. That is [`docs/00-work-plan.md`](docs/00-work-plan.md), and it stays the only file that answers _"where are we?"_.
> **The ritual.** Finish a checkpoint, run its verify command, tick the boxes. At the end of a phase, **stop.** The next phase starts only when it is asked for.

---

## How to use this file

|                        |                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rhythm**             | Every checkpoint is three beats, always in this order: **Test → Build → Verify**                                                                                                                         |
| **IDs**                | `Ph0`…`Ph6` are the phases from [20 · Execution Plan](docs/05-delivery/20-execution-plan.md) and are **not renumbered**. `Ph2.3` is a checkpoint inside `Ph2` — a decimal extension, not a new ID family |
| **Done**               | A checkpoint is done when its verify command is green. A _phase_ is done when its exit gate is green. Nothing is "mostly done"                                                                           |
| **The gate**           | Each phase ends in a **⏸ STOP** block. Do not begin the next phase until the user asks for it                                                                                                            |
| **Definition of Done** | The nine-item list in [15 §9](docs/04-build/15-repo-and-conventions.md). Read it, do not re-derive it                                                                                                    |
| **When behind**        | The scope-cut ladder in [20 §5](docs/05-delivery/20-execution-plan.md). Never cut schemas, persistence, the Critic floor, the vetoes, or the refuse-to-heal case                                         |

**Why Test before Build, everywhere.** [16 · Agent Test Suite](docs/04-build/16-agent-test-suite.md) was written before the agent, and writing it surfaced five specification contradictions ([16 §11](docs/04-build/16-agent-test-suite.md)) while they were still one-line fixes. That ordering is the project's cheapest quality mechanism, and this file simply refuses to abandon it at the code layer.

### Two clocks — read this once

[20 · Execution Plan](docs/05-delivery/20-execution-plan.md) budgets 8.5 hours across these seven phases. That is a **demo sprint** clock. This file is written for a **foundation** clock: tests first, every threshold asserted on both sides, every guard and invariant with a named test. The **phase order and the exit gates are identical**; the durations are not, and `Ph1` in particular will take several times its 60-minute budget when built to this bar.

That is a deliberate trade and it is the user's to reverse. If the demo clock wins, [20 §2](docs/05-delivery/20-execution-plan.md) column 5 says exactly what to drop.

---

## Phase map

| Phase                        | Delivers                                                             | Exit gate                                               | Detail                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Ph0`** Pre-flight         | Workspace, guardrails, CI — on an empty tree                         | `pnpm lint`, `pnpm verify`, `pnpm doctor` all green     | [15 §11](docs/04-build/15-repo-and-conventions.md)                                                                                             |
| **`Ph1`** Spine              | Schemas, store, FSM + 11 guards, loop harness, API/SSE, eval harness | A stubbed session runs start to finish                  | [20](docs/05-delivery/20-execution-plan.md), [04](docs/02-architecture/04-system-architecture.md), [05](docs/02-architecture/05-data-model.md) |
| **`Ph2`** Explorer           | Auth, perception, frontier, clustering, ranking                      | `EC-02` — a map with the model gone                     | [08](docs/02-architecture/08-perception-layer.md), [09](docs/03-algorithms/09-exploration-and-prioritisation.md)                               |
| **`Ph3`** Planner + Critic   | Plans, coverage score, the re-plan loop                              | `EC-03` — a weak plan is sent back and clears the floor | [10](docs/03-algorithms/10-planner.md), [11](docs/03-algorit                                                                                   |
| hms/11-coverage-critic.md)   |
| **`Ph4`** Generator + Runner | Compiler, live validation, execution, evidence                       | `EC-01` — a suite is emitted and runs green             | [12](docs/03-algorithms/12-generator.md)                                                                                                       |
| **`Ph5`** Triage + Healer    | Six causes, scoring, vetoes, patch, rollback, verify                 | `EC-05` heals · `EC-06` refuses                         | [13](docs/03-algorithms/13-triage-and-healing.md)                                                                                              |
| **`Ph6`** Reporter + UI      | Score, report, dashboard, demo                                       | `EC-07` and the 4:00 script twice clean                 | [14](docs/03-algorithms/14-quality-report-and-score.md), [18](docs/04-build/18-ui-spec.md), [22](docs/05-delivery/22-demo-runbook.md)          |

---

## Ph0 · Pre-flight

**Goal.** An empty workspace that already refuses the mistakes we would otherwise make at hour five.
**Read first.** [15 §2](docs/04-build/15-repo-and-conventions.md) (layout) · [15 §11](docs/04-build/15-repo-and-conventions.md) (the ordered pre-flight) · [README §MVP shape](README.md)
**At this phase the guardrails _are_ the tests.** There is no source to unit-test yet; the import graph, the lint rules and the CI jobs are the assertions.

### Ph0.0 — Resolve the one open ruling before it reaches code

- [x] `FR-904`'s acceptance criterion in [02 §9](docs/01-foundation/02-requirements.md) still reads _"Exit codes 0 / 0 / 2 / 3"_, with no code for _completed, and found a real defect_. [04 §3.4](docs/02-architecture/04-system-architecture.md) and [16 §11.5](docs/04-build/16-agent-test-suite.md) both implement exit **1**, and [00 §7](docs/00-work-plan.md) marks `W-5` resolved — but doc 02 was never amended, so three documents disagree in writing.
- [x] **Decide and amend in one commit:** either add the defect row to `FR-904`'s criterion, or reword `S-4`. `EC-05`, `EC-06` and `EC-07` assert exit `1` today; this must be settled before `Ph1.3` writes the exit-code mapping.

### Ph0.1 — Toolchain pinned

- [x] **Build** `.nvmrc` at `22.11.0`; `corepack prepare pnpm@10.12.4 --activate`
- [x] **Verify** `node -v` equals `.nvmrc`; `pnpm -v` equals the pin

### Ph0.2 — Workspace skeleton

- [x] **Build** `pnpm-workspace.yaml`, root `package.json` with the scripts in [15 §6.1](docs/04-build/15-repo-and-conventions.md) _verbatim_, `tsconfig.base.json` from [15 §3](docs/04-build/15-repo-and-conventions.md), and every directory in [15 §2](docs/04-build/15-repo-and-conventions.md) with an empty package manifest
- [x] **Build** `.env.example` complete and valueless, from [15 §7](docs/04-build/15-repo-and-conventions.md); `.gitignore` from [15 §8.3](docs/04-build/15-repo-and-conventions.md)
- [x] **Verify** `pnpm install` succeeds; `pnpm typecheck` is green on the empty tree

### Ph0.3 — Guardrails, on the empty tree

- [x] **Build** `.dependency-cruiser.cjs` — all **eight** rules from [15 §2.2](docs/04-build/15-repo-and-conventions.md), copied exactly
- [x] **Build** ESLint: the no-throw law scoped to tool paths ([15 §4.1](docs/04-build/15-repo-and-conventions.md)) and the three determinism restrictions ([15 §4.4](docs/04-build/15-repo-and-conventions.md)). Prettier. `vitest.config.ts`, `playwright.config.ts`
- [x] **Verify** `pnpm lint` green — _before_ any feature code exists. This is the step [15 §11](docs/04-build/15-repo-and-conventions.md) says is the whole point of the phase

### Ph0.4 — CI and hooks

- [x] **Build** the five jobs in [15 §10](docs/04-build/15-repo-and-conventions.md) — `guard`, `unit`, `replay`, `golden`, `nightly`. No retries, no `continue-on-error`
- [x] **Build** the machine-owned-path guard ([15 §8.2](docs/04-build/15-repo-and-conventions.md)) and the three git hooks ([15 §10.2](docs/04-build/15-repo-and-conventions.md))
- [x] **Verify** a throwaway commit touching `tests/generated/**` fails the guard job

### Ph0.5 — Browser and doctor

- [x] **Build** `playwright install chromium --with-deps`, pinned; the browser revision in the CI cache key
- [x] **Build** `forge doctor` — Node, pnpm, Chromium revision, ports, model reachability, and the three safety-env failure conditions in [15 §7](docs/04-build/15-repo-and-conventions.md)
- [x] **Verify** `pnpm doctor` exits non-zero when a pin is drifted, zero when it is not

> ### ⏸ Ph0 exit gate
>
> `pnpm lint` · `pnpm verify` · `pnpm doctor` — all green on an empty workspace. The `FR-904` ruling is written down.
> **Stop here. Ph1 begins on request.**

---

## Ph1 · Spine

**Goal.** A stubbed session runs from `POST /sessions` to a terminal state, through the real FSM, persisted, streamed, and replayable — with every stage a stub.
**Read first.** [05 · Data Model](docs/02-architecture/05-data-model.md) · [04 §3](docs/02-architecture/04-system-architecture.md) · [06 §2](docs/02-architecture/06-agent-contracts.md) · [17 · API Spec](docs/04-build/17-api-spec.md) · [16 §3](docs/04-build/16-agent-test-suite.md)
**Owns.** `FR-901`…`FR-906` · `TG-1`…`TG-11` · `I-1` `I-2` `I-4` `I-7` `I-8` `I-9` `I-11` `I-12` `I-13` `I-15` `I-16`

**This is the phase to over-invest in.** Its output is frozen ([00 §5](docs/00-work-plan.md)) and three later phases are invalidated by one late Zod edit.

### Ph1.1 — Schemas and the determinism chokepoints

- [x] **Test** schema round-trip for every entity in [05 §2](docs/02-architecture/05-data-model.md); `I-13` grounding (`schema/grounding.test.ts`); the ID-prefix regexes in [05 §6](docs/02-architecture/05-data-model.md)
- [x] **Test** `Session.input` cannot carry `password` — a type-level assertion, not a runtime check ([05 §2.2](docs/02-architecture/05-data-model.md))
- [x] **Build** `packages/core/schema/*` — Zod first, types via `z.infer`, never the reverse ([15 §3.1](docs/04-build/15-repo-and-conventions.md))
- [x] **Build** `packages/core/src/env.ts` — `Clock`, `Rng`, `IdGen`, injected through `RunContext` ([15 §4.4](docs/04-build/15-repo-and-conventions.md))
- [x] **Verify** `pnpm test`, and `pnpm lint` proves `core` reaches nothing

### Ph1.2 — Store

- [x] **Test** `I-1` gapless append-only `seq` · `I-2` evidence path carries its own sha256 and a prefix hit compares the **full** hash · `I-9` traversal escapes rejected · `I-16` the password literal appears in no row, payload or file
- [x] **Build** `migrations/001_init.sql` exactly as [05 §4](docs/02-architecture/05-data-model.md) writes it, including the `CHECK (replan_rounds <= 2)` and both unique indexes
- [x] **Build** `appendEvent`, `putEvidence`, `safeWrite`, `redact`, `resolveEvidence`
- [x] **Verify** the four invariant tests, at the paths [05 §5](docs/02-architecture/05-data-model.md) names

### Ph1.3 — The FSM and its eleven guards

- [x] **Test** one test per `TG-n` asserting **the transition and its refusal** — the refusal column in [16 §8.2](docs/04-build/16-agent-test-suite.md) is the specification
- [x] **Test** `I-4` heal caps · `I-11` no `GENERATING` without an assessment · `I-12` `replanRounds ≤ 2` · `I-15` exactly one terminal status, every lap `BANKED` with one outcome
- [x] **Test** the exit-code mapping from [04 §3.4](docs/02-architecture/04-system-architecture.md), per the `Ph0.0` ruling
- [x] **Build** the session machine, the lap machine, `guards.ts`, and the lap scheduler. Persist **before** emit, always — that ordering is the whole of `FR-903` ([04 §7](docs/02-architecture/04-system-architecture.md))
- [x] **Verify** all eleven guard tests green; the illegal-transition test throws

### Ph1.4 — `runAgentLoop()`

- [x] **Test** each `exitReason` in [06 §2](docs/02-architecture/06-agent-contracts.md) — `EMITTED`, all three ceilings, `FORCED_CLOSE`, `SCHEMA_FAILED` after two failures, `MODEL_UNAVAILABLE`
- [x] **Test** the forced close produces a _partial, validated_ artefact and propagates into `haltReason`
- [x] **Build** the harness in `packages/agents/harness` — the only place in the repo that imports `@anthropic-ai/*`, enforced by `one-model-client`
- [x] **Verify** `pnpm lint` fails if a second `import Anthropic` is added anywhere

### Ph1.5 — API and SSE shell

- [x] **Test** the event envelope and its ordering guarantees; the error catalogue; loopback binding ([17 §4](docs/04-build/17-api-spec.md), [§8](docs/04-build/17-api-spec.md), [§9](docs/04-build/17-api-spec.md))
- [x] **Test** `POST /sessions` never echoes `password`, and `TG-1` fires within 2 s with no second call (`FR-002`)
- [x] **Build** every endpoint group in [17 §2](docs/04-build/17-api-spec.md), returning stubbed stage output
- [x] **Verify** a stubbed session reaches a terminal state over the real HTTP surface

### Ph1.6 — The eval harness

- [x] **Test** key derivation including `callIndex` and `stateSignature` ([16 §3.4](docs/04-build/16-agent-test-suite.md)) — the `snapshot()`-twice case is the one that matters
- [x] **Test** `forge eval` exit codes: 0 when every case matched, including cases whose own sessions exit 1 or 2 ([16 §10.1](docs/04-build/16-agent-test-suite.md))
- [x] **Build** `RecordedModelClient` and `ReplayToolset` — the **two** seams, and no third ([16 §3.1](docs/04-build/16-agent-test-suite.md)); the case-file loader ([16 §6](docs/04-build/16-agent-test-suite.md)); the runner loop ([16 §7](docs/04-build/16-agent-test-suite.md)), which drives the real API
- [x] **Build** `forge` CLI skeleton with the commands in [15 §6](docs/04-build/15-repo-and-conventions.md) that this phase can honour
- [x] **Verify** `pnpm forge eval --tier replay` runs the harness end to end against a stub case

### Ph1.7 — Freeze

- [x] **Verify** `pnpm verify` green, `pnpm forge reset` under 20 s (`NFR-9`), a kill-and-restart mid-session resumes on the same lap (`FR-903`)
- [x] **Build** tag or note the schema freeze in [00 · Work Plan](docs/00-work-plan.md), same commit

> ### ⏸ Ph1 exit gate
>
> A stubbed session runs start to finish over the real API, through the real FSM, persisted and replayable. Eleven guard tests and eleven invariant tests green. **`packages/core/schema` is now frozen.**
> **Stop here. Ph2 begins on request.**

---

## Ph2 · Explorer

**Goal.** A real URL in, a capability map out — and the map still comes out with the model unplugged.
**Read first.** [08 · Perception Layer](docs/02-architecture/08-perception-layer.md) · [09 · Exploration & Prioritisation](docs/03-algorithms/09-exploration-and-prioritisation.md)
**Owns.** `FR-101`…`FR-110` · `TG-2` `TG-3` · `I-17` `I-20` · model call site 1

### Ph2.1 — Record the perception fixtures first

- [ ] **Build** `fixtures/perception/{aperture-checkout,saucedemo-login,conduit-editor}.snapshot.yaml` ([16 §3.6](docs/04-build/16-agent-test-suite.md)) — three structurally different pages, captured before any detector exists
- [ ] **Verify** each is under the snapshot budget in [08 §7](docs/02-architecture/08-perception-layer.md)

### Ph2.2 — Perception, pure

- [ ] **Test** `detectLoginForm()` reaches confidence `1.00` on all three fixtures with **zero configuration** — that is `FR-101`'s acceptance criterion and it runs in milliseconds
- [ ] **Test** `stateSignature()` collapses the `/product/:sku` variants to one state ([16 §5, EC-02](docs/04-build/16-agent-test-suite.md)) · `I-20` every destructive affordance is also `observedNotExercised`
- [ ] **Build** `packages/perception` — snapshot, signature, affordances, deny-list ([08 §2](docs/02-architecture/08-perception-layer.md)–[§4](docs/02-architecture/08-perception-layer.md))
- [ ] **Verify** unit tier, no browser, under the 5 s budget

### Ph2.3 — Authentication

- [ ] **Test** `storageState` is written once and reused; zero re-logins during a crawl (`FR-102`)
- [ ] **Build** [09 §2](docs/03-algorithms/09-exploration-and-prioritisation.md). `.auth/` is a secret — never evidence, never an event payload
- [ ] **Verify** the credential grep finds nothing in `artifacts/` (`I-16`, again, now with a real login)

### Ph2.4 — The frontier

- [x] **Test** all four `haltReason` values are reachable, and termination is guaranteed for each (`FR-107`)
- [x] **Build** the frontier loop, deduplication, the origin scope (`FR-109`), the politeness throttle ([09 §3](docs/03-algorithms/09-exploration-and-prioritisation.md), [§4](docs/03-algorithms/09-exploration-and-prioritisation.md))
- [x] **Verify** limits are counters in a `for` loop, not prompt instructions ([06 §2.2](docs/02-architecture/06-agent-contracts.md))

### Ph2.5 — Clustering and ranking

- [x] **Test** `I-17` — `rank()` returns an identical order across **five** invocations on one stored map
- [x] **Test** `TG-2`'s degrade: zero capabilities yields one synthetic capability, never `ERROR`
- [x] **Build** nav-stripping clustering ([09 §5](docs/03-algorithms/09-exploration-and-prioritisation.md)) and six-factor risk ranking ([09 §6](docs/03-algorithms/09-exploration-and-prioritisation.md))
- [x] **Verify** the `EC-01` backlog order: Checkout · Sign-in · Account Orders · Cart · Browse

### Ph2.6 — The agent loop, last

- [x] **Build** `packages/agents/explorer` on the `Ph1.4` harness — the model chooses _what to visit next_, nothing else ([06 §4.1](docs/02-architecture/06-agent-contracts.md))
- [x] **Build** the breadth-first deterministic fallback
- [x] **Verify** `pnpm forge eval --case EC-02` — **zero model calls**, `source: "deterministic"`, exit 0

> ### ⏸ Ph2 exit gate
>
> `EC-02` green on both tiers with `ANTHROPIC_API_KEY` unset, and `forge explore <url>` produces a map on a real target.
> **Stop here. Ph3 begins on request.**

---

## ⏱ 45-min sprint cut · Ph3–Ph6

> **Why.** Demo clock for Ph3–Ph6 is **345 min**. Full foundation bar does not fit in 45. This section is the [20 §5](docs/05-delivery/20-execution-plan.md) / [21 §6](docs/05-delivery/21-resilience.md) ladder applied hard.
>
> **Never cut (floor):** Critic arithmetic + 0.70 floor · deterministic plan fallback · vetoes + refuse-to-heal · rollback on failed verify · one readable report · schemas/persistence already in Ph1.
>
> **Cut entirely for this sitting:** agentic Planner/Critic/Triage call sites · Ph3.3 identity/Markdown polish · Ph3.5 PRD gaps · live locator lint + repair polish · `trace.zip` / network summaries · six-signal score precision to `1e-6` · signature cache · five-screen dashboard · docker/rehearsals · SauceDemo/Conduit · `EC-01` live / `EC-07` cold-clone / `R-1`…`R-4`.
>
> **Clock (45 min):**

|   Min | Ship                                                                                               | Gate                                                          |
| ----: | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
|  0–15 | **Ph3‡** structural score + floor + template plan + re-plan cap (`ACCEPT_RISK`)                    | unit: `0.4519` → `REPLAN`, `0.70` → `PASS`; plan with LLM off |
| 15–28 | **Ph4‡** compile fixture plan → emit 1 portable spec; run it (DOM/screenshot evidence only)        | emitted suite runs; heal attempts 0                           |
| 28–40 | **Ph5‡** pre-classifier + V1–V5 + auto-heal one locator + refuse assertion (`V2`/`I-3`) + rollback | heal once · refuse once · `git diff` empty on refusal         |
| 40–45 | **Ph6‡** RobustnessScore + Markdown report only                                                    | `forge report` prints five mandated sections                  |

**Deferred checkbox mark:** items below use `⏭` when out of this sprint. Resume the full phase text after the sprint if time returns.

---

## Ph3 · Planner + Critic

**Goal.** A weak plan is rejected, re-planned with named gaps, and the revision clears the floor — with the model gone.
**Read first.** [11 · Coverage Critic](docs/03-algorithms/11-coverage-critic.md) (the highest-value document in the set) · [10 · Planner](docs/03-algorithms/10-planner.md) · [ADR-017](docs/decisions/ADR-017-arithmetic-blocks.md)
**Owns.** `FR-201`…`FR-209` · `FR-301`…`FR-308` · `TG-5a` `TG-5b` `TG-6` · `I-14` · call sites 2 and 3

### Ph3.1 — The structural score, pure · **KEEP (15 min core)**

- [x] **Test** the `EC-03` round-0 term breakdown `A 9/21 · T 5/12 · S 3/4 · C 1/4 · D 4/6` → score **0.4619** (doc 11 §3.4 prints 0.4519; arithmetic of the stated terms is 0.4619) ([16 §5](docs/04-build/16-agent-test-suite.md))
- [x] **Test** the floor on both sides: `0.6999` → `REPLAN`, `0.70` → `PASS` ([16 §8.4](docs/04-build/16-agent-test-suite.md))
- [ ] ⏭ **Test** the two emergent properties _(sprint: one of the two if time; else later)_
- [x] **Build** `packages/core/critic` — `structuralScore()`, `classGaps()`, the verdict function ([11 §3](docs/03-algorithms/11-coverage-critic.md), [§4](docs/03-algorithms/11-coverage-critic.md), [§6](docs/03-algorithms/11-coverage-critic.md))
- [x] **Verify** the whole file runs in the unit tier — no model, no browser

### Ph3.2 — The deterministic Planner, before the agentic one · **KEEP**

- [x] **Test** the template plan derived from affordances alone satisfies `TG-5a` grounding for every step
- [x] **Build** the affordance-derived fallback plan ([11 §9](docs/03-algorithms/11-coverage-critic.md), [10](docs/03-algorithms/10-planner.md))
- [x] **Verify** a plan exists with `FORGE_LLM_ENABLED=false`

### Ph3.3 — Identity and rendering · **⏭ CUT this sitting**

- [ ] ⏭ **Test** `I-14` — a re-plan preserves `scenarioId` for scenarios whose steps are unchanged
- [ ] ⏭ **Test** `markdown_renders_byte_identically` from the JSON ([16 §8.6](docs/04-build/16-agent-test-suite.md), `FR-202`)
- [ ] ⏭ **Build** the scenario-identity merge and the Markdown renderer

### Ph3.4 — The re-plan loop · **KEEP (thin)**

- [x] **Test** `TG-6`'s refusal: `replanRounds` 2 → the third round never happens · the cap yields `ACCEPT_RISK`, not a silent pass
- [x] **Test** `TG-5b`'s three branches, including _blocks at score 1.0 when a `BLOCKER` exists_
- [x] **Build** the loop, `Lap.acceptedRisk[]`, and `carriedGaps` into the next planning call
- [x] ⏭ **Build** `packages/agents/planner` and `packages/agents/critic` on the harness — use **deterministic fallback only** this sitting (`FORGE_LLM_ENABLED=false`)

### Ph3.5 — PRD gap analysis _(bonus `B1` — first on the cut ladder)_ · **⏭ CUT**

- [ ] ⏭ **Build** [11 §8](docs/03-algorithms/11-coverage-critic.md), `FR-307`

> ### ⏸ Ph3 exit gate · **sprint substitute**
>
> Unit: `0.4519` → `REPLAN` · `0.70` → `PASS` · template plan with LLM off · `replanRounds` cap → `ACCEPT_RISK`.
> Full `EC-03` replay eval is **deferred** until agent transcripts land.
> **Stop here. Ph4 begins on request.**

---

## Ph4 · Generator + Runner

**Goal.** A suite is compiled, validated against the live page, run, and evidenced — and it still runs after FORGE is uninstalled.
**Read first.** [12 · Generator](docs/03-algorithms/12-generator.md) · [19 · Target Applications](docs/04-build/19-target-apps.md)
**Owns.** `FR-401`…`FR-408` · `FR-501`…`FR-509` · `TG-7` `TG-8`

### Ph4.1 — The compiler, pure · **KEEP**

- [x] **Test** `compile_is_byte_identical` · `no_wall_clock_in_emitted_code` · `no_target_literals_in_packages` ([16 §8.6](docs/04-build/16-agent-test-suite.md))
- [ ] ⏭ **Test** the generation locator ladder detail _(sprint: hard-code role→name→testid ladder in compiler)_
- [x] **Build** `packages/core/compile` — the five passes ([12 §2](docs/03-algorithms/12-generator.md)). Model output is **never executed** ([04 §8](docs/02-architecture/04-system-architecture.md))
- [x] **Verify** two compiles of one fixture plan hash equal

### Ph4.2 — Live validation · **⏭ CUT this sitting** (drop ambiguous locators at compile time instead)

- [ ] ⏭ **Test** `TG-7`'s refusal: a locator resolving to 2 **drops the scenario** rather than taking the first
- [ ] ⏭ **Build** the live probe, `resolvedCount`, the one repair pass, drop-with-a-stated-reason ([12 §4](docs/03-algorithms/12-generator.md))
- [ ] ⏭ **Verify** `forge lint:locators`

### Ph4.3 — The emitted project · **KEEP (thin — one capability)**

- [x] **Build** the portable project layout ([12 §6](docs/03-algorithms/12-generator.md)) — one spec per capability, zero cross-capability imports, credentials from `process.env`
- [ ] ⏭ **Build** the machine-owned path contract polish
- [ ] ⏭ **Verify** `git diff` on `tests/generated/**` is empty for human commits

### Ph4.4 — The Runner · **KEEP (thin — no trace/network)**

- [x] **Test** evidence rows per executed step (DOM + screenshot minimum); path carries sha256 prefix; redaction of secrets (`FR-507`)
- [x] **Build** execution + evidence capture; ⏭ fingerprint / `trace.zip` / network summary
- [ ] ⏭ **Verify** `trace.zip` opens in Trace Viewer

> ### ⏸ Ph4 exit gate · **sprint substitute**
>
> Fixture plan compiles twice identically; emitted suite runs green; heal attempts **0**. Live `EC-01` deferred.
> **Stop here. Ph5 begins on request.**

---

## Ph5 · Triage + Healer

**Goal.** One lap heals a broken address and refuses a false claim. This phase is the product's argument.
**Read first.** [13 · Triage & Healing](docs/03-algorithms/13-triage-and-healing.md) · [ADR-001](docs/decisions/ADR-001-veto-gated-healing.md) · [16 §11.1](docs/04-build/16-agent-test-suite.md)
**Owns.** `FR-601`…`FR-606` · `FR-701`…`FR-711` · `TG-9` `TG-10` · `I-3` `I-5` `I-6` `I-7` `I-10` · call sites 4 and 5

### Ph5.1 — The pre-classifier · **KEEP**

- [ ] **Test** `I-6` a fired veto implies `final = true` · a `final` pre-classification makes **zero** model calls
- [ ] **Test** the [16 §11.1](docs/04-build/16-agent-test-suite.md) amendment: **first** match wins for `kind`/`confidence`/`final`, **every** matching row contributes its veto id
- [ ] **Build** `packages/core/diagnose` — the ten rows, six causes ([13 §2](docs/03-algorithms/13-triage-and-healing.md), [§3](docs/03-algorithms/13-triage-and-healing.md))

### Ph5.2 — Signatures and the repeat cache · **⏭ CUT this sitting**

- [ ] ⏭ **Test** / **Build** [13 §4](docs/03-algorithms/13-triage-and-healing.md)

### Ph5.3 — Candidates and the six-signal score · **KEEP (thin)**

- [ ] **Test** `I-5` — only `resolvedCount === 1` is eligible, filtered **before** scoring
- [ ] ⏭ **Test** `EC-05` arm A to `1e-6` with all six sub-scores _(sprint: score order + gate thresholds only)_
- [ ] **Test** `xpath_never_reaches_the_auto_heal_gate` ([16 §8.5](docs/04-build/16-agent-test-suite.md)); trust ceilings in [16 §8.4](docs/04-build/16-agent-test-suite.md)
- [ ] **Build** the healing ladder and a minimal scorer ([13 §6](docs/03-algorithms/13-triage-and-healing.md)–[§8](docs/03-algorithms/13-triage-and-healing.md))

### Ph5.4 — The five vetoes · **KEEP (both halves)**

- [ ] **Test** one dedicated test per veto, **both halves** ([16 §8.1](docs/04-build/16-agent-test-suite.md))
- [ ] **Test** `V2` blocks at `0.71` (`EC-06`)
- [ ] **Test** `I-3` — an assertion-kind step never receives a patch
- [ ] **Build** `packages/core/healing/vetoes` ([13 §10](docs/03-algorithms/13-triage-and-healing.md)). Vetoes **before** any score

### Ph5.5 — The decision gates · **KEEP**

- [ ] **Test** both sides of every threshold: `0.6499/0.65`, `0.8499/0.85`, margin `0.0499/0.05`
- [ ] **Test** `TG-9`'s refusal — any of the three conditions absent blocks the heal
- [ ] **Build** [13 §9](docs/03-algorithms/13-triage-and-healing.md), and `TG-9` in the FSM

### Ph5.6 — Patch, verify, roll back · **KEEP (thin)**

- [ ] **Test** `TG-10`: failed full-flow verify **rolls back byte-for-byte** · `I-7`
- [ ] ⏭ **Test** `I-10` version increment polish · unified-diff parse
- [ ] **Build** patch + verify + rollback ([13 §12](docs/03-algorithms/13-triage-and-healing.md), [§13](docs/03-algorithms/13-triage-and-healing.md)); ⏭ escalation card polish

### Ph5.7 — The two agent call sites, last · **⏭ CUT this sitting**

- [ ] ⏭ **Build** agent triage call sites — deterministic pre-classifier stands alone (`FR-605`)

> ### ⏸ Ph5 exit gate · **sprint substitute**
>
> One heal accepted · one refuse (`V2` or assertion) with empty suite diff · rollback on failed verify. Full `EC-04`/`EC-05`/`EC-06` replay deferred.
> **Stop here. Ph6 begins on request.**

---

## Ph6 · Reporter + UI + demo

**Goal.** The deliverable: a portable suite, a report a judge can audit, and a run that survives a cold machine.
**Read first.** [14 · Quality Report & Score](docs/03-algorithms/14-quality-report-and-score.md) · [18 · UI Spec](docs/04-build/18-ui-spec.md) · [22 · Demo Runbook](docs/05-delivery/22-demo-runbook.md)
**Owns.** `FR-801`…`FR-807` · `I-18` `I-19` · `P-4` `P-5` · `NFR-10`

### Ph6.1 — The report arithmetic, pure · **KEEP**

- [ ] **Test** `I-18` all five brief-mandated contents populated · `I-19` `RobustnessScore.current` recomputes **exactly** from stored rows
- [ ] **Test** `residualGaps` and `acceptedRisk` render as **two** sections, never merged ([14 §2](docs/03-algorithms/14-quality-report-and-score.md))
- [ ] ⏭ **Test** untested flow risk ranking / `hoursSaved` assumptions _(sprint: `hoursSaved = null`)_
- [ ] **Build** `packages/core/report` ([14 §3](docs/03-algorithms/14-quality-report-and-score.md)–[§7](docs/03-algorithms/14-quality-report-and-score.md)). Zero model calls

### Ph6.2 — Three renderings, one truth · **KEEP (Markdown only)**

- [ ] ⏭ **Test** `report_renderings_agree` across three formats
- [ ] **Build** Markdown renderer + `forge report <sessionId>` · ⏭ JSON/HTML twins

### Ph6.3 — The dashboard · **⏭ CUT this sitting**

- [ ] ⏭ **Build** the five screens / coverage diff / decision inspector / score panel
- [ ] ⏭ **Build** empty/loading/degraded/error states
- [ ] ⏭ **Verify** `P-4`/`P-5` / [18 §12](docs/04-build/18-ui-spec.md)

### Ph6.4 — Ship surface · **⏭ CUT this sitting**

- [ ] ⏭ **Build** `docker-compose.yml`, `forge freeze`, `forge mutate`
- [ ] ⏭ **Verify** `forge reset` under 20 s _(already proven in Ph1)_

### Ph6.5 — Rehearsals · **⏭ CUT this sitting**

- [ ] ⏭ **Verify** `R-1`…`R-4` · `forge eval --coverage` · `--repeat 5`

> ### ⏸ Ph6 exit gate · **sprint substitute**
>
> `forge report` emits five mandated sections from stored rows; residual gaps ≠ accepted risk. `EC-07` / live 7/7 / 4:00 dress deferred.
> **Stop. This is the 45-min deliverable.**

---

## The ID ledger — which phase owns what

The specification distributes these across five documents. This table exists only to say **when** each one gets its named test, so nothing arrives at `Ph6` unasserted.

| Family                                                    | Total | Owned by                                         |
| --------------------------------------------------------- | ----: | ------------------------------------------------ |
| `TG-1`…`TG-11` transition guards                          |    11 | **`Ph1.3`** — all eleven, transition and refusal |
| `I-1` `I-2` `I-9` `I-16` store                            |     4 | `Ph1.2`                                          |
| `I-4` `I-7` `I-11` `I-12` `I-13` `I-15` FSM and grounding |     6 | `Ph1.3`                                          |
| `I-8` evidence resolution                                 |     1 | `Ph1.2` (store half) → `Ph5.1` (diagnosis half)  |
| `I-17` `I-20` perception and ranking                      |     2 | `Ph2.2`, `Ph2.5`                                 |
| `I-14` scenario identity                                  |     1 | `Ph3.3`                                          |
| `I-3` `I-5` `I-6` `I-10` healing                          |     4 | `Ph5.1`, `Ph5.3`, `Ph5.4`, `Ph5.6`               |
| `I-18` `I-19` report                                      |     2 | `Ph6.1`                                          |
| `V1`…`V5` vetoes, both halves                             |     5 | `Ph5.4`                                          |
| `EC-01`…`EC-07` golden cases                              |     7 | `Ph2`–`Ph6` exit gates                           |
| `R-1`…`R-4` rehearsals                                    |     4 | `Ph6.5`                                          |
| Threshold boundaries, both sides                          |     7 | `Ph3.1`, `Ph5.3`, `Ph5.5`                        |
| The five emergent-property tests                          |     5 | `Ph3.1` (2), `Ph5.3` (2), `Ph3.1`/`Ph5.4` (1)    |

**`Ph1.3` carries eleven guard tests and `Ph5.4` carries ten veto assertions.** Those two checkpoints are where this build is won or lost — everything else is arithmetic with a test beside it.

---

## Working rules

Six, from [00 §5](docs/00-work-plan.md). They are repeated here only because this is the file open while building.

1. **One task, one branch, one gate, one commit.** Nothing is done until `pnpm verify` is green.
2. **Docs and code change together.** A behaviour change with no doc edit fails review.
3. **IDs are permanent.** Never renumber, never reuse. `grep -rn "FR-304" docs/` before touching anything.
4. **The schema freezes at the end of `Ph1`.** One Zod edit after that invalidates work in three places.
5. **When `main` is red, revert first and diagnose second.**
6. **Simplicity is a gate, not a preference.** A component that cannot be explained in three sentences is wrong.

And one that belongs to this file specifically: **a checkpoint with a passing implementation and no test is not started.**
