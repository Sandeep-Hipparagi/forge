# 00 · Problem Alignment

> **Status:** Source of truth. Every other document in this repo derives from this one.
> **Rule:** if a feature does not appear in the coverage table in §3 or the rubric table in §4, it does not get built.

The problem statement lives at [`docs/problem-statement/problem-statment.md`](../problem-statement/problem-statment.md).
This document maps it, clause by clause, onto requirement IDs, documents and code — so that at any moment we can answer *"where are we against the brief?"* in one screen.

---

## 1. What they are actually asking for

Read the Background section slowly:

> *"AI-assisted testing tools can now generate test plans and executable test files from a live application, and repair failing tests automatically. **What they do not do is orchestrate these capabilities end to end** — deciding when to plan, when to generate, when to heal, and when to escalate — without a human directing each step."*

That paragraph is a description of **Playwright Agents**, shipped in Playwright 1.56 and current in 1.62: a `planner` that explores an app and emits a Markdown plan, a `generator` that turns the plan into specs with live selector validation, and a `healer` that replays failures and repairs locators. The brief reuses their exact vocabulary — *Planner*, *Generator*, *Healer*, *"live selector validation"*, *"replays failing tests"*.

**The inference that governs this project:**

> Aivar knows the three capabilities exist and are commoditised. They are not asking us to build a better locator healer. They are asking us to build **the layer above** — the meta-agent that decides *when* to invoke each capability, judges the quality of what came back, and knows when to stop, re-plan, or hand it to a human.

Three consequences we accept without argument:

1. **The orchestrator is the product.** Planner, Generator and Healer are components. Effort spent making a component 10% better is effort not spent on the thing being graded.
2. **We speak their vocabulary.** Our sub-agents are named `Planner`, `Generator`, `Healer` — not metaphors a judge has to translate while holding a rubric ([ADR-014](../decisions/ADR-014-plain-vocabulary.md)).
3. **The interesting work is in the seams.** Between Planner and Generator sits a coverage evaluation the brief makes a hard MUST. Between Runner and Healer sits a defect classification the brief lists as a Bonus. Both seams are where the 20% "innovation" score lives.

### 1.1 The three questions a judge will ask

| Question | Our one-sentence answer | Proof surface |
|---|---|---|
| *"Did it really run without me?"* | One command, one URL, zero prompts — Autopilot is the default. | Live run, terminal visible |
| *"Are the tests any good, or just green?"* | The Critic scores the plan before code is written, and blocks on gaps. | Coverage-gap panel, before and after |
| *"How do I know it didn't just paper over a bug?"* | Five hard vetoes no confidence score can override; a real defect exits non-zero. | The refuse-to-heal scenario |

---

## 2. What changed when the real statement arrived

This repository was scaffolded against an *assumed* problem. The brief arrived and moved the target. We record the delta honestly, because some of the ADRs it invalidates are still on disk.

| Area | Assumed | Actual | Disposition |
|---|---|---|---|
| Primary input | `{baseUrl, natural-language intent}` | **URL alone**, plus username and password | `FR-001`; intent demoted to optional (`FR-004`) |
| Authentication | Not considered | An explicit named input | New: `FR-101`, `FR-102` |
| Exploration | **Explicitly out of scope** — *"autonomous free-roaming browsing agent"* | A hard MUST — *"explore the application"* | **Reversed.** See [ADR-011](../decisions/ADR-011-agent-topology.md) |
| Coverage evaluation | Absent | Hard MUST, between Planner and Generator | New: `FR-3xx` |
| Test breadth | Rejected — *"mass generation is noise"* | *"meaningful user flows — not just happy paths"* | Softened: breadth **gated by a Critic** |
| Sub-agent framing | *"logical modules, not agents"* (ADR-008) | Three named sub-agents plus a meta-agent | ADR-008 superseded by [ADR-011](../decisions/ADR-011-agent-topology.md) |
| Quality report | Absent | Hard MUST, five named contents | New: `FR-8xx` |
| Design intelligence | A core pillar — ~600 lines, 8 tasks | **Never mentioned. Scores nothing.** | Deferred — [ADR-013](../decisions/ADR-013-design-intelligence-deferred.md) |

**What survived intact, and is now an asset rather than a liability:** the veto-gated healing engine, six-cause failure classification (which turns out to be the brief's Bonus item, already designed), content-addressed immutable evidence, `RunContext` determinism injection, the append-only event log, and the enforced import graph. The engine room was right. The front half of the pipeline was missing.

---

## 3. Requirement coverage

Levels are the brief's own: **Must Have** / **Good to Have** / **Bonus** / **Out of Scope**. `FR-*` IDs are defined in [02 · Requirements](02-requirements.md).

### 3.1 Must Have — all seven

| # | Brief clause (abridged) | Our requirements | Owner | Doc |
|---|---|---|---|---|
| M1 | Accept a web application URL as the sole required input and begin autonomously | `FR-001` `FR-002` `FR-901` | Orchestrator | [04](../02-architecture/04-system-architecture.md) |
| M2 | Planner sub-agent explores the app and produces a **human-readable** test plan | `FR-201`…`FR-206` | Planner | [10](../03-algorithms/10-planner.md) |
| M3 | Planner covers **meaningful user flows — not just happy paths** | `FR-204` `FR-302` | Planner + Critic | [11](../03-algorithms/11-coverage-critic.md) |
| M4 | **Evaluate the plan for coverage gaps before the Generator** — missing flows, edge cases, error states | `FR-301`…`FR-306` | Critic | [11](../03-algorithms/11-coverage-critic.md) |
| M5 | Generator produces executable test files with **live selector and assertion validation** | `FR-401`…`FR-407` | Generator | [12](../03-algorithms/12-generator.md) |
| M6 | Run the suite; Healer on failure, **distinguishing broken script from genuine defect** | `FR-501`…`FR-505`, `FR-601`…`FR-607`, `FR-701`…`FR-710` | Runner + Triage + Healer | [13](../03-algorithms/13-triage-and-healing.md) |
| M7 | Final test quality report: scenarios covered, pass/fail, healer actions, gaps remaining, **untested flow risk** | `FR-801`…`FR-807` | Reporter | [14](../03-algorithms/14-quality-report-and-score.md) |

Clause M7 names five contents. All five are first-class fields on `QualityReport`, not prose in a template — see [14 §2](../03-algorithms/14-quality-report-and-score.md).

### 3.2 Good to Have — all three, and all cheap

| # | Brief clause | Our requirements | Cost | Verdict |
|---|---|---|---|---|
| G1 | Optional PRD to inform Planner scope | `FR-003` `FR-207` | ~30 min — one more input to an existing brief | **Build** |
| G2 | Natural-language intent (*"focus on checkout and auth"*) | `FR-004` `FR-208` | ~20 min — biases prioritisation, never replaces exploration | **Build** |
| G3 | Parallel execution across user flows | `FR-506` `FR-902` | ~45 min — Playwright workers over already-isolated capabilities | **Build** |

G1 and G2 are near-free because the Planner already takes a structured brief; they add fields to it. G3 is near-free because the Capability Lap ([ADR-012](../decisions/ADR-012-capability-lap.md)) already makes each flow independently runnable — parallelism falls out of the topology instead of being retrofitted into it.

### 3.3 Bonus — both

| # | Brief clause | Our requirements | Note |
|---|---|---|---|
| B1 | PRD-to-test-plan gap analysis after generation | `FR-307` | The Critic already diffs a plan against a capability model. A PRD is a second model to diff against — same algorithm, different input. |
| B2 | Confident defect classification: broken script vs genuine app bug | `FR-601`…`FR-607` | **Already the centre of gravity of the existing design.** Six causes, deterministic pre-classifier, five hard vetoes, cited evidence. |

B2 is the item we are strongest on before we start, because the pre-brief design was built around exactly this question. We lead the demo with it.

### 3.4 Out of Scope — honoured, and said out loud

| Brief exclusion | Our position |
|---|---|
| Production deployment / hosting at scale | Local-first. One `docker compose up` for judges. Not a hosted product ([ADR-015](../decisions/ADR-015-deployment.md)). |
| CI/CD integration | We emit a portable Playwright project; wiring it to CI is the user's five-minute job. We do not build it. |
| Cross-browser matrix | Chromium only. Multiplies flake by three, adds no idea. |
| Complete coverage of a production app | Explicitly not the goal — the Critic reports what is *not* covered rather than pretending otherwise. This is a feature. |
| **Manually written test scripts** | **Enforced, not promised.** `tests/generated/**` is written only by the Generator; CI fails on a human commit to that path. See [15 §4](../04-build/15-repo-and-conventions.md). |

That last row is the one with teeth. Every team will *claim* the agent wrote the tests. We make it structurally checkable.

---

## 4. Evaluation rubric → where we score

The brief weights six dimensions. This table is the build's priority ordering; when time runs out we cut from the bottom.

| Weight | Criterion | What we show | Where it is built | Cut rank |
|---|---|---|---|---|
| **30%** | Functionality & completeness — full pipeline end to end, no manual intervention | One command → URL in → suite and report out. Terminal and dashboard both visible. | [04](../02-architecture/04-system-architecture.md), [17](../04-build/17-api-spec.md) | Never |
| **20%** | Innovation — how intelligently the orchestrator handles coverage gaps, ambiguity, failure classification | Three original mechanisms: the **Coverage Critic** with a re-plan loop, the **Capability Lap** for bounded context, the **veto ladder** that refuses to heal | [11](../03-algorithms/11-coverage-critic.md), [ADR-012](../decisions/ADR-012-capability-lap.md), [13](../03-algorithms/13-triage-and-healing.md) | Never |
| **20%** | Technical implementation — robustness of the agentic loop, quality of generated tests, depth of the healer | A typed FSM, not a `while` loop; a deterministic compiler so model output is never executed; six-signal locator scoring with every sub-score stored | [04 §3](../02-architecture/04-system-architecture.md), [13](../03-algorithms/13-triage-and-healing.md) | Never |
| **15%** | UX & demo clarity — how clearly the agent's decisions are presented | Every decision inspectable in under five seconds with cited evidence; the Robustness Score as the one number a manager reads | [18](../04-build/18-ui-spec.md), [14](../03-algorithms/14-quality-report-and-score.md) | Trim polish, keep the score |
| **10%** | Business impact — meaningfully reduces manual QA effort | Score **delta**: 34 → 71 in one session, with hours-saved arithmetic derived from real run timings | [14 §5](../03-algorithms/14-quality-report-and-score.md) | Keep the number, cut the chart |
| **5%** | Presentation — trade-offs and architecture explained | Fifteen ADRs, each an explicit A-vs-B with a flip trigger | [decisions/](../decisions/) | Already written |

### 4.1 The 20% we are most likely to lose, and the plan

"Innovation in handling coverage gaps and ambiguity" is the criterion most teams will fail silently — they will generate tests, run them, and treat gaps as a footnote. Three defences:

- **The Critic blocks.** A plan below the coverage floor does not reach the Generator; it goes back to the Planner with named missing flows. The re-plan loop is visible on the dashboard and in the event log. Judges watch the orchestrator *change its mind*.
- **Ambiguity has a defined home.** Scores in the 0.65–0.85 band are neither healed nor failed; they escalate with a human-action card. "We don't know" is a first-class outcome with its own terminal state, not a coin flip.
- **Untested-flow risk is quantified.** The report does not say *"87% covered"*. It names the flows nobody is testing and ranks them by blast radius.

---

## 5. Submission checklist

The brief §6 lists six deliverables. Tracked here; owner and status live in [20 · Execution Plan](../05-delivery/20-execution-plan.md).

| # | Deliverable | Where it comes from |
|---|---|---|
| S1 | Working prototype running live on a target application | The build |
| S2 | Source repo with clear setup instructions | [root README](../../README.md) plus `docker compose up` |
| S3 | README documenting architecture, pipeline design, how to run | [root README](../../README.md), derived from [04](../02-architecture/04-system-architecture.md) |
| S4 | Architecture diagram of the orchestration flow between sub-agents | [04 §2](../02-architecture/04-system-architecture.md) — drawn once, exported to the deck |
| S5 | Demo video, 2–5 minutes | [22 · Demo Runbook](../05-delivery/22-demo-runbook.md) — scripted to 4:00 with a 2:30 cut |
| S6 | Deck: problem, approach, trade-offs, business impact | Trade-offs come straight from the ADRs; impact from the score delta |

**S4 is a scoring item disguised as a formality.** The diagram is what a judge stares at while we talk. It is drawn once, in [04](../02-architecture/04-system-architecture.md), and every other appearance is that same image.

---

## 6. Ground truth on the target application

The brief says the organiser *may* provide URLs on the day, and advises us not to wait. Our position:

1. The agent takes **any** URL. Nothing about a specific application is hardcoded — no selectors, no route names, no fixtures.
2. We arrive with three known-good targets of increasing difficulty, so the pipeline has met real variety before the day ([19 · Target Applications](../04-build/19-target-apps.md)).
3. We keep one **locally mutable** target whose defects we can inject on demand. Proving *refusal to heal* requires a bug we control; you cannot inject a bug into somebody else's demo site.
4. On the day the organiser's URL becomes the primary demo target and ours becomes the fallback. Rehearsal `R-3` is exactly this switch, executed cold ([21 · Resilience](../05-delivery/21-resilience.md)).

---

## 7. Related documents

- What we are building and why → [01 · Vision & Scope](01-vision-and-scope.md)
- The requirement IDs this document cites → [02 · Requirements](02-requirements.md)
- Why the topology is Planner / Critic / Generator / Healer → [ADR-011](../decisions/ADR-011-agent-topology.md)
- Why work is sliced one capability at a time → [ADR-012](../decisions/ADR-012-capability-lap.md)
