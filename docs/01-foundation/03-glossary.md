# 03 · Glossary

Shared vocabulary. If two people use the same word for different things, the code ends up with two meanings too.

**The naming rule ([ADR-014](../decisions/ADR-014-plain-vocabulary.md)):** a component is named for what it does, in one word a QA engineer already uses. No invented word where an industry-standard word exists. The UI shows the same word the code uses.

---

## Session and orchestration

| Term | Definition | Not to be confused with |
|---|---|---|
| **Session** | One end-to-end run: a URL in, a suite and a report out. The only required input is the URL (`FR-001`). | A run, which is one execution of one scenario. |
| **Orchestrator** | The typed FSM that decides what happens next and can prove why. Makes **zero** model calls. | The "meta-agent" of the brief — same thing, our word for it. |
| **Guard** (`TG-n`) | A typed, unit-tested condition on a state transition. The orchestrator's intelligence lives here, not in a prompt. | A prompt instruction, which is a request, not a control. |
| **Capability** | A user-meaningful unit of what an application does — *Checkout*, *Sign-in*, *Profile*. Named, not routed. | A page or a route. One capability usually spans several. |
| **Capability Lap** (**lap**) | One capability carried all the way — plan, critique, generate, run, triage, heal, verify, bank — before the next begins ([ADR-012](../decisions/ADR-012-capability-lap.md)). | A stage. A lap contains all of them. |
| **Banking** | Ending a lap by writing the spec file, recomputing the score and regenerating the report. What makes partial success real: kill the process and what is on disk is verified and runnable. | Committing to git, which is a separate human act. |
| **Backlog** | The capabilities, risk-ordered before lap 1. Deterministic given the map (`I-17`). | A queue of tasks. Order is the product here, not an implementation detail. |
| **Autopilot / Copilot** | The two modes. Autopilot is the default and never pauses. Copilot pauses **only between laps**, never inside one. | A "human in the loop" toggle that gates every stage — the pattern that gets products abandoned. |
| **Escalation** | Handing a decision to a human with a complete evidence pack. A first-class outcome with its own terminal state. | A failure. *"We don't know"* is a legitimate answer. |

## Perception

| Term | Definition | Not to be confused with |
|---|---|---|
| **Snapshot** | The accessibility tree of a page — roles, accessible names, structure — with refs assigned. The perception primitive. Under 8 KB (`FR-104`). | A screenshot, or a DOM dump. Both are captured too, as *evidence*. |
| **Ref** | A snapshot-local handle (`e42`) for one interactive node. Lets a model refer to an element without ever emitting a selector. | A locator. A ref is valid inside one snapshot; a locator is compiled and durable. |
| **Affordance** | Something a user could do here: a button, a link, a field. The atom every plan step is grounded in. | An element. Every affordance is an element; most elements are not affordances. |
| **State** | One deduplicated screen of the application, identified by its signature. | A URL. Fifty paginated URLs are one state. |
| **State signature** | A 16-character structural hash of a snapshot, with content, digits and repeated siblings normalised away. What makes exploration terminate (`FR-107`, `FR-108`). | A DOM hash, which changes on every price and every build. |
| **Transition** | An observed edge: from one state, via one affordance, to another state. | A link. A transition is something we *did*, not something we saw. |
| **Capability map** | The state graph plus the affordances plus the clustered capabilities. The Explorer's output. | A sitemap. |
| **Frontier** | The affordances discovered but not yet exercised. Exploration ends when it empties or a budget runs out — and the map records **which**. | A queue. The `haltReason` is a report field, not diagnostics. |
| **Deny-list** | The destructive-verb list that stops the Explorer submitting *delete*, *pay*, *cancel* and friends on somebody's live application (`FR-106`). Blocked affordances are **recorded**, not dropped. | A blocklist of URLs. |
| **`observedNotExercised`** | The flag on an affordance we saw and deliberately did not press. Turns a safety limit into a visible coverage gap. | A bug. It is the system reporting its own restraint. |

## Planning and critique

| Term | Definition | Not to be confused with |
|---|---|---|
| **TestPlan** | One capability's plan for one round: scenarios, in Markdown a human reads and JSON a machine runs, from one source (`FR-202`). | A test file. The plan is the source of truth; the spec is a projection ([ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md)). |
| **Round** | One planning attempt. Round 0 is the first; rounds 1 and 2 exist only if the Critic sent it back. Rounds are kept, never overwritten. | A retry. Each round is a stored artefact and part of the audit trail. |
| **Scenario** (`SC-nnn`) | One test: preconditions, ordered steps, an expected outcome, a class and a priority. Its id is stable across re-planning (`FR-205`). | A step. A scenario has several. |
| **Grounding** | The requirement that every step cite a `stateId` and an `affordanceRef` observed during exploration (`FR-204`, `I-13`). A step that cannot is dropped. | A hint to the model. Grounding is validated after the fact, not requested politely. |
| **Coverage gap** | A named, classed, severity-rated hole in a plan, with a suggested scenario. One of the brief's three classes: **missing flow**, **missing edge case**, **missing error state** (`FR-302`). | A coverage percentage, which names nothing and is therefore not actionable. |
| **Blocking floor** | The coverage score below which a plan does not reach the Generator. Arithmetic, not judgement — so the guard works with the model offline. | A target. It is a gate. |
| **Residual gaps** | The gaps that remain on a plan that **passed**. Present on every assessment (`FR-306`), because passing is not the same as complete. | Accepted risk, which is what residual gaps become after the re-plan cap is spent. |
| **PRD gap analysis** | Diffing the plan against a supplied requirements document and naming what is uncovered (`FR-307`, the brief's Bonus `B1`). | Coverage. This one is against stated intent, not against the application. |

## Generation and execution

| Term | Definition | Not to be confused with |
|---|---|---|
| **Compiler** | The deterministic function from `TestPlan` to `.spec.ts`. The model emits a strategy plus arguments; the compiler emits code (`FR-401`). | Code generation by a model, which we do not do anywhere. |
| **Locator** | A Playwright locator expression, e.g. `getByRole('button', { name: 'Place order' })`. An **address**. | The element it resolves to. |
| **Locator ladder** | The ordered preference of strategies, `getByRole` down to CSS, never raw XPath (`FR-404`). | A fallback chain. Lower rungs are allowed only when higher ones do not resolve uniquely. |
| **Live validation** | Resolving every locator and executing every assertion against the running application *before* the file is written (`FR-402`, `FR-403`). A scenario that cannot pass is dropped with a reason, never emitted red. | Running the tests, which happens afterwards. |
| **Assertion** | A truth claim about the product's behaviour or content. **Assertions are never healed.** | A locator, which is only an address. |
| **`targetIntent`** | A step's purpose in human language — *"submit the order"*. Survives every refactor; the anchor healing reasons against. | The locator, which is disposable. |
| **Evidence** | An immutable, content-addressed artefact: snapshot, DOM, screenshot, trace, console, network, diff, patch, agent transcript. Citable by id. | A log line. |
| **Flaky** | A step that failed and then passed on retry. Marked `FLAKY`, never `PASSED` (`FR-509`). | A pass. Laundering a flake into a pass is how suites lose their meaning. |

## Diagnosis and decision

| Term | Definition |
|---|---|
| **Diagnosis** | The classified cause of a failure, with confidence, at least three cited evidence ids, an explanation and a recommended action. |
| **`LOCATOR_BREAK`** | The element still exists with the same purpose; the old address no longer resolves. **Healable.** |
| **`CONTENT_DRIFT`** | The copy changed — a reworded label, a moved currency symbol — without the behaviour breaking. **Reportable, not healable.** (Renamed from `DESIGN_DRIFT` at the re-aim.) |
| **`PRODUCT_BUG`** | The application's behaviour or content contradicts the expected business behaviour. **Never healable.** |
| **`FLAKY`** | Non-deterministic timing or a race. Retry once, then escalate. |
| **`ENVIRONMENT`** | Server down, 5xx, seed missing, auth expired. Not the product's fault and not the test's. |
| **`UNKNOWN`** | Evidence is insufficient. Always escalates. |
| **Pre-classifier** | The deterministic classification that runs **before** any model call. Its vetoes are `final` and no model output may override them (`FR-604`). |
| **Veto** (`V1`…`V5`) | A deterministic rule that blocks healing regardless of score. Evaluated **before** scores, because a veto is not a very low score — it is a different kind of statement. |
| **Confidence gate** | The numeric bands: ≥ 0.85 auto-heal, 0.65–0.85 escalate, < 0.65 fail with evidence. |
| **Failure signature** | The hash that identifies a root cause across capabilities. A repeat costs no model call and is reported as *"same root cause as SC-014"*. |
| **Defect report** | What a `PRODUCT_BUG` verdict produces: expected, actual, and how to reproduce (`FR-606`). The artefact a developer actually acts on. |

## Healing

| Term | Definition |
|---|---|
| **ElementFingerprint** | A multi-signal snapshot of an element captured on a **successful** interaction: role, accessible name, text, testId, attributes, ancestor path, bbox, screenshot crop. |
| **Candidate** | A proposed replacement locator with its six sub-scores, its live-resolved count and a rationale. Only `resolvedCount === 1` is eligible. |
| **Signal** | One scored dimension: `semantic`, `role`, `text`, `domContext`, `visualGeometry`, `historical`. All six are persisted. |
| **Base trust** | A per-strategy **ceiling** on the score. A geometric match can never reach the auto-heal gate no matter how the sub-scores line up. |
| **Patch** | A change to the plan plus the unified diff of the regenerated spec file. The plan is patched; the code is regenerated. |
| **Rollback** | Restoring the pre-patch file byte-for-byte when verification fails (`FR-710`). The patch is applied inside a transaction whose commit point is *verification passing*, not *the write succeeding*. |
| **Verification** | Re-running the healed step **and then the entire scenario**. A heal is not accepted until both pass (`TG-10`). |

## Reporting

| Term | Definition |
|---|---|
| **QualityReport** | The final artefact. Contains all five things the brief names: scenarios covered, pass/fail outcomes, healer actions, coverage gaps remaining, untested flow risk (`FR-801`). |
| **Robustness Score** | One number in `[0,100]` from a published, deterministic formula. The number a manager reads. |
| **Score delta** | The score now, and the score if the open findings are fixed (`FR-803`). *"Your suite scores 34. Fix these four and it scores 71."* |
| **Untested flow risk** | The flows nobody is testing, **ranked by blast radius** rather than listed alphabetically (`FR-804`). |

## Operations

| Term | Definition |
|---|---|
| **Target** | The application under test. Any URL. Nothing about a specific application is hardcoded. Canonical roster in [19](../04-build/19-target-apps.md); supplementary external platforms in [target-apps/external-platforms.md](../target-apps/external-platforms.md). |
| **Mutation** | A runtime-toggleable defect injected into the bundled target to stage a demo scenario. Never a source edit. |
| **Golden case** (`EC-nn`) | A deterministic eval scenario with a fixed expected verdict. |
| **Rehearsal** (`R-n`) | A full drill: `R-2` is the whole demo with the API key unset; `R-3` is a cold switch to an unseen target URL. |
| **Deterministic mode** | Running with no model access. Everything except plan and gap *quality* still works (`NFR-2`), and the UI says so in amber. |
| **Freeze** | The point after which no architectural or feature change is permitted. The schema freezes at the end of Ph1. |

---

## Words we retired

Kept here because they appear in commits, in ADRs 001–010, and in anything written before 4 Sep 2026.

| Retired | Now | Why |
|---|---|---|
| **Argus** | Perception / Runner | [ADR-014](../decisions/ADR-014-plain-vocabulary.md) — a judge reads the rubric, not our mythology |
| **Daedalus** | — | The design pillar it named is deferred ([ADR-013](../decisions/ADR-013-design-intelligence-deferred.md)) |
| **Hephaestus** | Healer | ADR-014 |
| **TestSpec** | `Scenario`, inside a `TestPlan` | A spec was one test; a scenario is one of several in a capability's plan |
| **DesignContract**, **DesignFinding**, **Mask**, **Design rule** | — | Deferred with the pillar; the shapes are preserved in [deferred/](../deferred/design-intelligence.md) |
| **`DESIGN_DRIFT`** | `CONTENT_DRIFT` | The old name presumed a design contract we no longer maintain |
| **EvidencePack** | The evidence attached to a `Diagnosis` | One less noun for the same thing |
| **D0 / D-n** | `Ph0`…`Ph6` | Ten days became eight hours; phases order the work now, not days |

**FORGE** survives, as the product name. A product name is read once and remembered; a component name is read hundreds of times by people mid-task, and that is where the plain word earns its keep.
