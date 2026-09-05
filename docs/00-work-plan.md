# 00 · Work Plan

> **What this is.** The one file that answers *"where are we, and what is next?"* — for the documentation re-aim and for the build that follows.
> **Ritual.** Update the status column in the same commit as the work. A plan that lags the repo is worse than no plan, because people trust it.

**Legend:** ⬜ not started · 🔄 in progress · ✅ done · ⏸ blocked · ⏭ deliberately skipped

---

## 1. Where this stands

| | |
|---|---|
| **Trigger** | The real problem statement arrived 4 Sep 2026. The pre-brief docs aimed at a different target. |
| **Phase now** | Documentation complete; **main is a docs-only MVP baseline** |
| **Build window** | 6–8 hours, one sitting after the implementation workspace is created |
| **Governing document** | [01-foundation/00-problem-alignment.md](01-foundation/00-problem-alignment.md) |
| **Decisions taken** | [ADR-011](decisions/ADR-011-agent-topology.md) … [ADR-017](decisions/ADR-017-arithmetic-blocks.md) |

---

## 2. The four decisions that set the direction

Taken 4 Sep 2026, before Batch 1 was written. Each has an ADR.

| Decision | Chosen | ADR |
|---|---|---|
| Autonomy model | **Autopilot default, Copilot toggle** — autonomous end to end; gates only between capability laps, only on request | [ADR-012](decisions/ADR-012-capability-lap.md) |
| Design intelligence pillar | **Deferred** — not in the brief, zero rubric weight, ~2h of an 8h budget | [ADR-013](decisions/ADR-013-design-intelligence-deferred.md) |
| Deployment | **Local-first + one-command Docker** for judges | [ADR-015](decisions/ADR-015-deployment.md) |
| Vocabulary | **Plain names** — Explorer, Planner, Critic, Generator, Runner, Triage, Healer, Reporter | [ADR-014](decisions/ADR-014-plain-vocabulary.md) |

---

## 3. Documentation batches

Five batches. **Each ends at a checkpoint where the user reviews before the next begins** — that is the ritual, not a formality. A batch that has not been reviewed does not get built on.

### ✅ Batch 1 — Foundation re-aim · *complete*

The *why* and the *what*. Everything downstream cites these.

| | Document | Status |
|---|---|---|
| B1.1 | [01-foundation/00-problem-alignment.md](01-foundation/00-problem-alignment.md) — clause-by-clause brief map, rubric map, submission checklist | ✅ new |
| B1.2 | [01-foundation/01-vision-and-scope.md](01-foundation/01-vision-and-scope.md) — the loop, the components, scope, success criteria, the anti-pitch | ✅ rewritten |
| B1.3 | [01-foundation/02-requirements.md](01-foundation/02-requirements.md) — `FR-0xx`…`FR-9xx`, `NFR-1`…`NFR-10`, trace matrix, migration table | ✅ rewritten |
| B1.4 | [decisions/ADR-011-agent-topology.md](decisions/ADR-011-agent-topology.md) — deterministic meta-agent over agentic sub-agents | ✅ new |
| B1.5 | [decisions/ADR-012-capability-lap.md](decisions/ADR-012-capability-lap.md) — the unit of work | ✅ new |
| B1.6 | [decisions/ADR-013-design-intelligence-deferred.md](decisions/ADR-013-design-intelligence-deferred.md) | ✅ new |
| B1.7 | [decisions/ADR-014-plain-vocabulary.md](decisions/ADR-014-plain-vocabulary.md) | ✅ new |
| B1.8 | [decisions/ADR-015-deployment.md](decisions/ADR-015-deployment.md) | ✅ new |
| B1.9 | [README.md](README.md) — the documentation entry point, rewritten around the new set | ✅ rewritten |
| B1.10 | `deferred/design-intelligence.md` — the old doc 09, moved intact | ✅ moved |

**Checkpoint C1 — review Batch 1.** Confirm the pipeline shape, the requirement set and the four decisions. Everything after this builds on them, so a correction here is cheap and a correction at C3 is not.

---

### ✅ Batch 2 — Architecture · *complete*

How the pieces fit. The batch that produces the diagram a judge will stare at.

| | Document | Content | Status |
|---|---|---|---|
| B2.1 | [02-architecture/04-system-architecture.md](02-architecture/04-system-architecture.md) | **Rewrite.** Process topology, the session and lap FSMs with guards `TG-1`…`TG-11`, the capability-lap loop, five model call sites, failure isolation, the submission architecture diagram (S4). | ✅ rewritten |
| B2.2 | [02-architecture/05-data-model.md](02-architecture/05-data-model.md) | **Extend.** New: `Session`, `CapabilityMap`, `Capability`, `State`, `Transition`, `Affordance`, `Lap`, `TestPlan`, `Scenario`, `CoverageAssessment`, `Gap`, `QualityReport`, `RobustnessScore`. Retained: `Evidence`, `Diagnosis`, `HealCandidate`, `TestPatch`, `ElementFingerprint`. Removed: `DesignContract`, `DesignFinding`. Plus DDL and invariants `I-1`…`I-21`. | ✅ rewritten |
| B2.3 | [02-architecture/06-agent-contracts.md](02-architecture/06-agent-contracts.md) | **Rewrite of the old tool contracts.** The `runAgentLoop()` harness, the terminal tool and forced close, per-sub-agent contracts, the no-throw law, the least-privilege tool registry, budgets and ceilings. | ✅ renamed + rewritten |
| B2.4 | [02-architecture/07-llm-integration.md](02-architecture/07-llm-integration.md) | **Revise.** One model with per-call-site effort (resolves `W-2`), the two structured-output mechanisms, prompt caching on the lap shell, the resilience ladder, cost telemetry, what we deliberately do not use. | ✅ revised |
| B2.5 | [02-architecture/08-perception-layer.md](02-architecture/08-perception-layer.md) | **New.** Accessibility snapshots as the perception primitive, the state-signature algorithm and deduplication, the affordance model and deny-list, and why not raw DOM, vision or MCP. | ✅ new |
| B2.6 | [01-foundation/03-glossary.md](01-foundation/03-glossary.md) | **Revise.** Capability, lap, affordance, state signature, coverage gap, robustness score, banking — plus the retired-words table. | ✅ rewritten |
| B2.7 | [decisions/ADR-016-perception-transport.md](decisions/ADR-016-perception-transport.md) | **New, unplanned.** Direct Playwright over `@playwright/mcp` — resolves `W-4`, which was due this batch and needed a stated position before [08](02-architecture/08-perception-layer.md) could rest on one. | ✅ new |

**Checkpoint C2 — passed.** Architecture and data model reviewed and merged to `main` before any algorithm was specified against them.

**Carried from C2, still needs a ruling:** [04 §3.4](02-architecture/04-system-architecture.md) proposes deriving the process exit code from the terminal state **and** the findings, so that a completed run which found a real defect exits `1`. `FR-904` currently maps the four terminal states to `0/0/2/3` with no non-zero code for a found defect, which contradicts `S-4`. Either `FR-904`'s acceptance criterion takes a one-line amendment, or `S-4` is reworded. One of the two must move.

---

### ✅ Batch 3 — Algorithms · *complete*

The parts that carry the claim. Every document here is precise enough to implement from without re-deciding anything.

| | Document | Content | Status |
|---|---|---|---|
| B3.1 | [03-algorithms/09-exploration-and-prioritisation.md](03-algorithms/09-exploration-and-prioritisation.md) | Deterministic login detection and `storageState`; the frontier loop and its four halt reasons; the nav-stripping clustering algorithm; the six-factor risk-ranking function with intent as a promotion. | ✅ new |
| B3.2 | [03-algorithms/10-planner.md](03-algorithms/10-planner.md) | The lap packet and prompt contract; grounding validated after the loop; the scenario-identity merge; the `P0`…`P3` ceiling; the byte-identical Markdown renderer; the template fallback. | ✅ new |
| B3.3 | [03-algorithms/11-coverage-critic.md](03-algorithms/11-coverage-critic.md) | **The highest-value document in the set.** The five-term structural score and its worked `EC-03` trace, the 0.70 floor, the eight blocking rules, the severity clamp, the re-plan loop, PRD gap analysis, and the deterministic fallback. | ✅ new |
| B3.4 | [03-algorithms/12-generator.md](03-algorithms/12-generator.md) | The five compile passes, the generation locator ladder and why it differs from the healing one, live validation and the one repair pass, the portable project, byte-identical determinism. | ✅ new |
| B3.5 | [03-algorithms/13-triage-and-healing.md](03-algorithms/13-triage-and-healing.md) | **Revision of the old doc 08.** Six causes, the ten-row pre-classifier, the failure-signature cache, six-signal scoring, vetoes `V1`…`V5`, patch, rollback, `TG-10` verification, the defect report and escalation card. | ✅ moved + revised |
| B3.6 | [03-algorithms/14-quality-report-and-score.md](03-algorithms/14-quality-report-and-score.md) | The five mandated contents; the five-component Robustness Score with worked arithmetic; the projected delta and its interaction caveat; `haltReason`-gated flow risk; hours saved with its assumptions. | ✅ new |
| B3.7 | [decisions/ADR-017-arithmetic-blocks.md](decisions/ADR-017-arithmetic-blocks.md) | **New, unplanned.** Only arithmetic may mint or clear a `BLOCKER` — the property that makes `TG-5b` model-independent. [11](03-algorithms/11-coverage-critic.md) could not rest on it without a stated position. | ✅ new |

**Checkpoint C3 — passed.** Algorithms reviewed and merged before any build document was written against them.

**Ruled at C3:** the veto-to-case map in [13 §10](03-algorithms/13-triage-and-healing.md) — `V1`,`V2` → `EC-06`, `V3` → `EC-05`, `V4` → `EC-04`, `V5` → `EC-07` — **stands**, and [16 §5](04-build/16-agent-test-suite.md) implements it exactly. `EC-06` now proves `V1` *alone*, using a new non-numeric assertion defect (`M-12`), which is a stronger test than the pre-brief pairing.

---

### ✅ Batch 4 — Build · *complete*

What to type. Includes the test suite for our own agent, written before the agent.

| | Document | Content | Status |
|---|---|---|---|
| B4.1 | [04-build/15-repo-and-conventions.md](04-build/15-repo-and-conventions.md) | Package layout with `packages/agents/*`, `perception` and `orchestrator`; eight enforced import rules including `one-model-client`; the three determinism chokepoints; the `forge` CLI; the machine-owned-path CI guard; Definition of Done. Absorbs the old `16-workflow-and-automation`. | ✅ renumbered + rewritten |
| B4.2 | [04-build/16-agent-test-suite.md](04-build/16-agent-test-suite.md) | **The one built first.** Four tiers; the two-seam fixture harness (recorded transcripts + tool tapes) that runs the *real* orchestrator with no browser and no key; `D1`/`D2` determinism; golden cases `EC-01`…`EC-07`; the unit inventory; rehearsals `R-1`…`R-4`; five specification reconciliations. | ✅ new |
| B4.3 | [04-build/17-api-spec.md](04-build/17-api-spec.md) | REST + SSE surface, session lifecycle, the event envelope and its ordering guarantees, the error catalogue and the statuses deliberately absent, Copilot gates and escalations, loopback binding. | ✅ new |
| B4.4 | [04-build/18-ui-spec.md](04-build/18-ui-spec.md) | Google-minimal light tokens and the reversal from dark, the colour law, five screens, the coverage diff, the decision inspector, the score panel, `P-4`/`P-5`, accessibility, the UX checklist. | ✅ rewritten |
| B4.5 | [04-build/19-target-apps.md](04-build/19-target-apps.md) | Three targets and what each uniquely proves; Aperture's expanded surface, DOM contract and determinism controls; the `M-nn` defect registry; the target-profile format; the `R-3` cold switch; etiquette on somebody else's application. | ✅ rewritten |

**Checkpoint C4** — passed. The build specification is complete and internally consistent.

**Raised at C4, already applied:** writing the assertions before the code surfaced a defect in [13 §3](03-algorithms/13-triage-and-healing.md). As ordered, row 1 (`V1`) intercepts every input that could reach row 2 (`V3`), so `V3` could never fire. The pre-classifier now takes the **first** match for `kind`/`confidence`/`final` and collects **every** matching row's veto id — a one-line amendment, already made, recorded in [16 §11.1](04-build/16-agent-test-suite.md).

**Also raised at C4, resolved in Batch 5:** four pre-brief delivery documents were replaced by the canonical `20`–`23` set. ADRs remain permanent records and were retained.

---

### ✅ Batch 5 — Delivery & knowledge base · *complete*

| | Document | Content |
|---|---|---|
| B5.1 | `05-delivery/20-execution-plan.md` | The 8-hour plan in six phases with hard exit gates and the non-negotiable prototype floor. | ✅ new |
| B5.2 | `05-delivery/21-resilience.md` | Bounded retries, deterministic fallback, isolation, rollback, degraded mode, and scope cuts. | ✅ new |
| B5.3 | `05-delivery/22-demo-runbook.md` | The 4:00 script, 2:30 cut, pre-flight, failure drills, and Q&A. | ✅ new |
| B5.4 | `05-delivery/23-risk-register.md` | Risks, triggers, mitigations, owners, and the floor that is never cut. | ✅ new |
| B5.5 | `06-knowledge/README.md` | **The self-improving knowledge base** — what gets captured and what does not. | ✅ new |
| B5.6 | Root [`README.md`](../README.md) | Submission-facing orientation, architecture, layout, and commands. | ✅ rewritten |

**Checkpoint C5** — documentation complete. Build begins after review.

---

## 4. Build phases

Written now so the documentation batches know what they are feeding. Detailed in `05-delivery/20-execution-plan.md` (Batch 5).

| Phase | Budget | Delivers | Exit gate |
|---|---|---|---|
| **Ph0** Pre-flight | 15 min | Create the implementation workspace, install dependencies, pin the browser, check the model key | The new workspace passes `pnpm verify` and `pnpm doctor` |
| **Ph1** Spine | 60 min | Schemas, store, FSM skeleton, `runAgentLoop()`, API + SSE, the eval harness | A session runs end to end with every stage stubbed |
| **Ph2** Explorer | 90 min | Auth, perception, frontier, clustering, prioritisation | A real URL in → a capability map out |
| **Ph3** Planner + Critic | 90 min | Plans, coverage assessment, the re-plan loop | `EC-03`: a plan is rejected, re-planned, and clears the floor |
| **Ph4** Generator + Runner | 90 min | The compiler, live validation, execution, evidence | `EC-01`: a suite is emitted and runs green end to end (cold-clone portability is `EC-07`, [16 §11.3](04-build/16-agent-test-suite.md)) |
| **Ph5** Triage + Healer | 75 min | Classification, scoring, vetoes, patch, rollback, verify | `EC-05` heals; `EC-06` refuses |
| **Ph6** Reporter + UI + demo | 90 min | Score, report, dashboard, runbook, video | `EC-07`; the 4:00 script runs twice clean |

**The floor** — if everything else is cut, these still ship: URL in → explore → plan → critique → generate → run → classify → report, on one target, with the refuse-to-heal case working. That is every hard MUST plus the strongest Bonus.

---

## 5. Working agreements

Six rules. They exist because hour six is when discipline is worth the most and costs the most.

1. **One task, one branch, one gate, one commit.** No task is done until `pnpm verify` is green.
2. **Docs and code change together.** A behaviour change with no doc edit fails review; the docs are the spec, not a description.
3. **IDs are permanent** from Checkpoint C1 onward. Never renumber, never reuse. Superseding an ADR means a new number and a `Superseded by` line on the old one.
4. **`grep` before you rename.** Every ID is cited across four or five documents.
5. **The schema is frozen at the end of Ph1.** One Zod edit after that invalidates work in three places at once.
6. **Simplicity is a gate, not a preference.** If a component cannot be explained in three sentences, it is wrong. Complexity fails; simplicity scales.

---

## 6. Document map

The one-time renumbering taken at Batch 1. Nothing was deleted without a destination.

| Old | New | Note |
|---|---|---|
| `01-vision-and-scope` | `01-vision-and-scope` | Rewritten |
| `02-requirements` | `02-requirements` | Rewritten, new ID scheme |
| `03-glossary` | `03-glossary` | ✅ revised (B2.6) |
| `04-system-architecture` | `04-system-architecture` | ✅ rewritten (B2.1) |
| `05-data-model` | `05-data-model` | ✅ rewritten (B2.2) |
| `06-tool-contracts` | `06-agent-contracts` | ✅ renamed, rewritten (B2.3) |
| `07-llm-integration` | `07-llm-integration` | ✅ revised (B2.4) |
| — | `08-perception-layer` | ✅ new (B2.5) |
| `08-healing-engine` | `13-triage-and-healing` | ✅ moved and revised (B3.5) |
| `09-design-intelligence` | `deferred/design-intelligence` | ✅ moved — [ADR-013](decisions/ADR-013-design-intelligence-deferred.md) |
| `10-repo-and-conventions` | `15-repo-and-conventions` | ✅ renumbered, rewritten (B4.1) |
| `11-sut-spec` | `19-target-apps` | ✅ broadened to three targets (B4.5) |
| `12-ui-spec` | `18-ui-spec` | ✅ rewritten (B4.4) |
| `13-delivery-plan` | `20-execution-plan` | Replaced — ten-day schedule became an eight-hour build (B5.1) |
| `14-task-backlog` | *merged into* `20-execution-plan` | The old `T-nnn` series is retired |
| `15-testing-and-evals` | `16-agent-test-suite` | ✅ rewritten (B4.2) |
| `16-workflow-and-automation` | *merged into* `15-repo-and-conventions` | ✅ merged (B4.1) — two documents said one thing |
| `17-demo-runbook` | `22-demo-runbook` | Replaced, revised (B5.3) |
| `18-risk-register` | `23-risk-register` | Replaced, revised (B5.4) |
| — | `09`…`12`, `14` | ✅ new (B3.1–B3.4, B3.6) |
| — | `17` | ✅ new (B4.3) |
| — | `21`, `06-knowledge/**` | New (B5.2, B5.5) |

Why renumber at all: the numbers exist to give reading order. The pipeline changed shape, so the reading order changed. Numbers that no longer order anything are worse than no numbers — and this is the last cheap moment to fix it, because no external artefact cites them yet.

---

## 7. Open items

| # | Item | Resolve by | Status |
|---|---|---|---|
| `W-1` | Which three target applications ([19](04-build/19-target-apps.md))? | Batch 4 | ✅ **Resolved** — T1 the bundled mutable **Aperture**, T2 **SauceDemo** (public, login-gated), T3 **Conduit**/RealWorld (authenticated CRUD, self-hosted). [19 §1](04-build/19-target-apps.md) |
| `W-2` | Model per call site — one model everywhere, or cheap for exploration and strong for critique? | Batch 2 | ✅ **Resolved** — one model (`claude-opus-5`), effort tiered per call site. Ph2 measures whether call site 1 alone moves to Haiku 4.5. [07 §1](02-architecture/07-llm-integration.md) |
| `W-3` | Team size and parallel slices | Batch 5 | ⬜ Open. Plan assumes work can be split three ways; collapses cleanly to one |
| `W-4` | Is `@playwright/mcp` worth a subprocess, or do we call Playwright directly? | Batch 2 | ✅ **Resolved** — direct. We need Playwright in-process regardless; MCP would add a second browser stack for one stage. [ADR-016](decisions/ADR-016-perception-transport.md) |
| `W-5` | Exit code for a completed run that found a real defect — amend `FR-904`, or reword `S-4`? | **Checkpoint C4** | ✅ Resolved — completed runs with findings exit `1`; `EC-05`, `EC-06`, and `EC-07` assert it ([16 §11.5](04-build/16-agent-test-suite.md)). |
