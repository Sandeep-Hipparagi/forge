# 01 · Vision & Scope

> **Status:** Frozen once Batch 1 is approved. Changes require an ADR.
> **Supersedes:** the pre-brief edition of this document, written before the problem statement arrived. See [00 · Problem Alignment §2](00-problem-alignment.md) for the delta.
> **Audience:** everyone. Read this and [00](00-problem-alignment.md) before any other document.

---

## 1. The one sentence

**FORGE takes a URL and a login, explores the application on its own, and builds a real test suite one capability at a time — judging its own coverage before it writes code, and refusing to heal a test when the product is what actually broke.**

Three clauses, three claims, in the order a judge will test them:

| Clause | The claim | Where it is proven |
|---|---|---|
| *takes a URL and a login* | Nothing else is required. No config, no selectors, no fixtures. | `FR-001`, live demo |
| *one capability at a time* | Bounded context, prioritised order, no wall of red. | [ADR-012](../decisions/ADR-012-capability-lap.md) |
| *refusing to heal* | A self-healer that always heals is an anti-feature. | [13 §6](../03-algorithms/13-triage-and-healing.md) |

---

## 2. The problem, stated honestly

The brief opens with a sentence worth memorising:

> *"The core problem is not execution — it is decision-making: figuring out what to test, evaluating whether the right things were tested, and knowing when a failure reflects a real defect versus a broken script."*

Three decisions. Every one of them is currently made by a human, repeatedly, all day.

| The decision | Who makes it today | What it costs | Who makes it in FORGE |
|---|---|---|---|
| *What is worth testing here?* | A QA engineer clicking through the app | Hours per feature, and it is never written down | **Explorer + Planner** |
| *Did we test the right things?* | Nobody, honestly. Coverage % is a proxy that lies. | Silent gaps found in production | **Critic** |
| *Did the test break, or did the product?* | An engineer, at 9am, on a red build | 30–90 minutes per failure, every failure | **Triage + Healer** |

The tooling that exists automates *execution* — the part that was already cheap. The decisions stay manual. That is why a one-day feature takes three days to test.

### 2.1 The insight the whole system is built on

> A failing test is a **question**, not an answer. The question is: *"did the test break, or did the product break?"*
> Every existing self-healer guesses, and guesses in the direction that turns the build green. FORGE answers with cited evidence, and is allowed to say *no*.

A naive self-healer is an **anti-feature**: it converts a loud product regression into a silent green build. That is worse than having no test at all, because it costs you the belief that you were covered. Most teams in this hackathon will demo a healer. Very few will demo one that **declines**.

### 2.2 The second insight: coverage is a decision, not a percentage

Empirical work on behavioural test gaps finds roughly one in six expected behaviours entirely untested in suites that report high coverage. A percentage cannot tell you *which* behaviours. So FORGE never reports a bare coverage number as an achievement. It reports **named flows nobody is testing, ranked by blast radius** — because that list is actionable and a percentage is not.

---

## 3. The loop (memorise this)

```
Explore → Prioritise → Plan → Critique → Generate → Run → Triage → Heal or Escalate → Verify → Report
```

Ten steps. Every document in this repo maps back to one. If a proposed feature does not sit on this loop, it is out of scope.

| Step | Sub-agent | Produces | Brief clause |
|---|---|---|---|
| Explore | **Explorer** | `CapabilityMap` — an authenticated state graph | M2 |
| Prioritise | **Orchestrator** | `CapabilityBacklog`, risk-ranked | — (our addition) |
| Plan | **Planner** | `TestPlan` — Markdown a human reads, JSON a machine runs | M2, M3 |
| Critique | **Critic** | `CoverageAssessment` — gaps, edge cases, error states | **M4** |
| Generate | **Generator** | `.spec.ts` files with live-validated selectors | M5 |
| Run | **Runner** | `Run`, `Evidence[]`, `ElementFingerprint[]` | M6 |
| Triage | **Triage** | `Diagnosis` — one of six causes, with confidence | M6, B2 |
| Heal / Escalate | **Healer** | `TestPatch` or an escalation card | M6 |
| Verify | **Runner** | Re-run of the healed step *and* the whole flow | M6 |
| Report | **Reporter** | `QualityReport` + `RobustnessScore` | **M7** |

The two steps in bold are the ones competitors will skip.

---

## 4. The eight components

Plain names. The brief uses Planner, Generator and Healer; so do we ([ADR-014](../decisions/ADR-014-plain-vocabulary.md)).

| Component | The question it answers | Model calls? | Home |
|---|---|---|---|
| **Explorer** | *"What can this application do?"* | Yes — 1 per frontier batch | `packages/agents/explorer` |
| **Planner** | *"What is worth testing, and how?"* | Yes — 1 per capability | `packages/agents/planner` |
| **Critic** | *"What did we miss?"* | Yes — 1 per plan | `packages/agents/critic` |
| **Generator** | *"What is the executable form?"* | No — deterministic compiler | `packages/core/compile` |
| **Runner** | *"What actually happened?"* | No — Playwright | `packages/runner` |
| **Triage** | *"Test broken, or product broken?"* | Yes — 1 per novel failure | `packages/agents/triage` |
| **Healer** | *"Can this be repaired safely?"* | Rarely — only in the ambiguous band | `packages/core/healing` |
| **Reporter** | *"How healthy is this application?"* | No — arithmetic | `packages/core/report` |
| **Orchestrator** | *"What happens next, and can I prove why?"* | No — a typed FSM | `packages/orchestrator` |

**Read the "model calls?" column again.** Four of the nine components never call a model. The Generator emits code from validated JSON; the Runner executes; the scorer computes; the orchestrator transitions. This is the single most consequential design decision in the project, and §5.3 explains why.

---

## 5. Scope

### 5.1 In scope

1. **URL-only ingestion** with optional username/password, PRD and natural-language intent.
2. **Autonomous authenticated exploration** producing a capability map with a state graph.
3. **Risk-based prioritisation** of capabilities into an ordered backlog.
4. **Per-capability test planning** in human-readable Markdown plus canonical JSON.
5. **Coverage critique with a re-plan loop** — the plan must clear a floor before code is written.
6. **Deterministic compilation** of plans into portable Playwright specs with live selector validation.
7. **Execution with full evidence capture** — DOM, screenshot, console, network, trace.
8. **Six-cause failure classification** with confidence and cited evidence.
9. **Evidence-scored locator healing** with five hard vetoes and post-heal full-flow verification.
10. **Quality report and Robustness Score**, with a projected delta if the open findings are fixed.
11. **Autopilot and Copilot modes** — fully autonomous by default, human gates on request.
12. **A dashboard** where any decision is inspectable in under five seconds.

### 5.2 Out of scope

| Not building | Why | Where it would go later |
|---|---|---|
| Cross-browser / mobile matrix | Brief says out of scope. Triples flake, adds no idea. | Playwright projects config |
| CI/CD integration | Brief says out of scope. We emit a portable project; wiring is trivial and unscored. | GitHub Action template |
| Hosted multi-tenant SaaS | Brief says out of scope. Local-first is more reliable on venue wifi. | [ADR-015](../decisions/ADR-015-deployment.md) |
| Design / visual regression | Not in the brief. Zero rubric weight. | [deferred/](../deferred/design-intelligence.md), [ADR-013](../decisions/ADR-013-design-intelligence-deferred.md) |
| Healing assertions | Assertions are truth claims. Rewriting one is falsifying evidence. | Never. This is a permanent no. |
| Free-form model-driven browsing during test execution | Non-deterministic, unwatchable, slow. Exploration is agentic; **execution never is**. | — |
| Unit / API / load testing | The brief says end-to-end web. Staying in lane. | — |

### 5.3 Non-negotiables

Five rules that no deadline pressure gets to overturn.

1. **We do not maximise pass rate.** A run that correctly reports `PRODUCT_BUG` and exits non-zero is a *successful* run. Green is not the objective function; truth is.
2. **We do not heal assertions.** Locators are addresses. Assertions are claims. We may re-address; we may never re-claim.
3. **The model never drives the browser during execution.** It chooses among typed tools during exploration and planning. Generated tests are compiled from validated JSON by deterministic code. Model output is data, never code, never `eval`.
4. **Every decision cites evidence.** A verdict with fewer than three evidence references is a bug in FORGE, not a finding about the application.
5. **A capability is finished before the next one starts.** No half-done laps. See [ADR-012](../decisions/ADR-012-capability-lap.md).

Rule 3 is what makes the demo survive a dead API key. Rule 5 is what makes the output usable by a real team instead of a wall of red.

---

## 6. Autopilot and Copilot

The brief demands *"without human intervention between stages"* (30% of the score). Real engineering teams want a hand on the wheel. Both are true, and they are not in conflict once you separate **capability** from **default**.

| Mode | Between stages *within* a lap | Between laps | Who it is for |
|---|---|---|---|
| **Autopilot** (default) | Never pauses | Never pauses | The brief; the demo's first two minutes |
| **Copilot** (`--copilot`) | Never pauses | Pauses for approve / edit / reprioritise / add-scenario | A team adopting this on their real app |

Two properties make this honest rather than a hedge:

- **Copilot never adds a gate inside a lap.** The pipeline stage-to-stage is autonomous in both modes, always. Copilot only exposes the *seam between capabilities* — which is a seam Autopilot has too, it just walks straight through it.
- **Gates are tiered, not uniform.** Reversible actions auto-approve. Impactful-but-recoverable actions notify and continue. Only irreversible actions block. Uniform gating is how human-in-the-loop products get abandoned; the pause exists where it earns its keep.

The demo shows Autopilot first — URL in, suite out, hands off the keyboard. Then it flips to Copilot to show a human injecting a domain-specific scenario the agent could not have known ("our customers always apply the coupon *after* choosing shipping"). That contrast is the business-impact story: **the agent does the volume, the human adds the judgement**.

---

## 7. Success criteria

### 7.1 Product — all must be true on demo day

| ID | Criterion | Measured by |
|---|---|---|
| S-1 | A cold start against an unseen URL produces a runnable suite with zero human input | Rehearsal `R-3` |
| S-2 | The Critic rejects at least one plan and the Planner's revision clears the floor — visibly | Eval case `EC-03` |
| S-3 | A benign locator break heals, and the **full flow** re-runs green | `EC-05` |
| S-4 | A genuine product defect is **refused**, classified, and exits non-zero | `EC-06` |
| S-5 | Every verdict shows at least three cited evidence items | UI assertion across all `EC-*` |
| S-6 | The quality report contains all five contents the brief names | Schema assertion, `EC-07` |
| S-7 | The Robustness Score and its projected delta are both shown | `EC-07` |
| S-8 | The whole demo runs with the network unplugged except for the model call | Rehearsal `R-2` |

### 7.2 Performance

Fast is a feature, not a nicety — a slow agent is one nobody leaves running.

| ID | Budget | Why this number |
|---|---|---|
| P-1 | First capability planned within **60 s** of submitting a URL | Attention span of a judge, and of a developer |
| P-2 | One full capability lap under **90 s** | Ten capabilities in a coffee break |
| P-3 | One heal cycle under **10 s** | Fits inside a demo sentence |
| P-4 | Dashboard first paint under **1.0 s**, every interaction under **100 ms** | The Google bar. Instant or it is broken. |
| P-5 | Streamed events visible within **300 ms** of occurring | The run must feel alive, not batched |

### 7.3 Evaluation

Seven golden cases, run automatically, 7/7 before the freeze. See [16 · Agent Test Suite](../04-build/16-agent-test-suite.md) — which is built **first**, before the agent it tests.

---

## 8. The judge's mental model

If a judge remembers one thing, make it this table:

| | Test broke | Product broke |
|---|---|---|
| **Symptom** | Identical red X | Identical red X |
| **A naive self-healer** | Fixes it — good | **Fixes it — catastrophic** |
| **FORGE** | Heals, patches the file, re-verifies the whole flow | Refuses, classifies, escalates with evidence, exits 1 |

The demo is engineered to produce that table on stage. Everything else — the dashboard, the score, the architecture diagram — exists to make that moment land.

---

## 9. The anti-pitch

> **"Isn't this just Playwright's own agents?"**
>
> Playwright ships a planner, a generator and a healer — and we use that lineage deliberately. But they are three tools a human invokes in sequence, deciding each time whether the plan was good enough, whether the failure was real, whether to try again. FORGE is the layer that makes those decisions. Concretely: a coverage critic that sends a plan *back*, a defect classifier that stops the healer, and a scheduler that finishes one capability before starting the next. Their words: *"what they do not do is orchestrate these capabilities end to end."* That is the whole product.

> **"Isn't this just Octomind / mabl / Tricentis?"**
>
> Those platforms proved the market — no argument. Their healers are *recovery* mechanisms: locator broke, find another, continue. Ours is a *decision* layer with hard vetoes that no confidence score can override. The differentiator is not that we heal. It is that we sometimes **refuse to**.

> **"What if the model is wrong?"**
>
> Then four of our nine components are unaffected, because they never call it. The compiler, the runner, the scorer and the orchestrator are deterministic code. With the API key removed, the suite still runs, failures still classify via the deterministic pre-classifier, and the report still generates. Model quality changes how *insightful* FORGE is. It does not change whether FORGE *works*.

---

## 10. Related documents

- The brief, mapped clause by clause → [00 · Problem Alignment](00-problem-alignment.md)
- Requirements with IDs → [02 · Requirements](02-requirements.md)
- Architecture → [04 · System Architecture](../02-architecture/04-system-architecture.md)
- Why each major choice was made → [decisions/](../decisions/)
