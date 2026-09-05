# 11 · Coverage Critic

> **The highest-value document in the set.** The brief's clause `M4` — *"evaluate coverage before generating tests"* — is the one requirement most entries will satisfy with a prompt that says "please check your work". This document is the argument that we did something else.
> **This document owns:** the structural coverage formula, the blocking floor, the gap severity rules, the verdict function, the re-plan loop, and the PRD gap analysis.
> **Governing decision:** [ADR-017](../decisions/ADR-017-arithmetic-blocks.md) — only arithmetic may block the pipeline.

---

## 1. What has to be true here

| Requirement | The uncomfortable version |
|---|---|
| `FR-301` — evaluate every plan before it reaches the Generator | The gate must exist even when the model is down |
| `FR-303` — score in `[0,1]`, reproducible from stored inputs | The same plan must score the same number five times |
| `FR-304` — block and re-plan below the floor or on a `BLOCKER` | Blocking must not be a suggestion the model can talk itself out of |
| `FR-306` — emit residual gaps even on a pass | Passing is not the same as complete, and the report must say so |
| `FR-308` — degrade, never skip | With no API key, `FR-301` still holds |
| `S-2` | A judge watches a plan get rejected and the revision clear the floor |

Read together, those force one conclusion: **the blocking decision cannot depend on a model.** Everything in this document follows from that.

---

## 2. Two halves, one verdict

```
                    ┌──────────────────────────────────────────┐
   TestPlan  ──────►│  structuralScore(plan, subgraph)         │──► score ∈ [0,1]   pure
   Subgraph  ──────►│  classGaps(plan)                         │──► BLOCKER gaps    pure
                    └──────────────────────────────────────────┘
                                     │  (both computed BEFORE the call, and shown to it)
                                     ▼
                    ┌──────────────────────────────────────────┐
   + PRD     ──────►│  semanticGaps(...)          call site 3  │──► gaps, MAJOR max
                    └──────────────────────────────────────────┘
                                     ▼
                            verdict(score, gaps, round)   ──►  PASS · REPLAN · ACCEPT_RISK
```

| | Structural half | Semantic half |
|---|---|---|
| Package | `packages/core/critic` — pure, no I/O | `packages/agents/critic` — one model call |
| Produces | `score`, class-presence gaps, structural-hole gaps | Judgement gaps: what a tester would have thought of |
| Determinism | Bit-reproducible from stored rows | Varies in wording between runs |
| May mint a `BLOCKER` | **Yes** | **No** — capped at `MAJOR` |
| Runs when the model is unavailable | Yes | No; the stage still runs (`FR-308`) |

The Critic has **no page access at all** ([06 §3](../02-architecture/06-agent-contracts.md)). It cannot verify a gap by looking. That is deliberate: a Critic that can browse produces assessments that depend on what it happened to load, which is exactly the non-reproducibility the score exists to eliminate.

---

## 3. The structural coverage score (`FR-303`)

### 3.1 The five terms

```ts
// packages/core/critic/src/structural.ts — pure
export function structuralScore(plan: TestPlan, sub: CapabilitySubgraph): StructuralCoverage;
```

| Term | Weight | Numerator | Denominator |
|---|---|---|---|
| **A** affordance coverage | 0.30 | Distinct `affordanceRef`s cited by any step of any scenario | Eligible affordances in the subgraph |
| **T** transition coverage | 0.25 | Distinct observed transitions a scenario's step sequence traverses | Transitions in the subgraph |
| **S** state coverage | 0.15 | Distinct `stateId`s cited | States in the subgraph |
| **C** class coverage | 0.20 | Distinct `ScenarioClass` values present | 4 |
| **D** assertion density | 0.10 | `min(1, assertionSteps / (2 · scenarios))` | — (already normalised) |

```
score = 0.30·A + 0.25·T + 0.15·S + 0.20·C + 0.10·D          rounded to 4 decimal places
```

### 3.2 The definitions that decide the number

Coverage arguments are won and lost in the denominator, so each of these is a stated rule with a unit test, not a judgement call.

- **Eligible affordances** are those with `enabled: true` and `destructive: false`. A deny-listed affordance is **excluded from the denominator** — otherwise every score on every real application is permanently capped below 1.0 by our own safety policy, which would make the floor meaningless. Its exclusion is not silence: §5.3 mints a `MINOR` gap for it by rule, so it appears in the report as untested rather than as uncountable.
- **Distinct** means distinct. Five scenarios that all click `e9` cover one affordance. This is what makes padding a plan futile ([§7.3](#73-why-padding-does-not-work)).
- **A traversed transition** is a `(fromState, affordance, toState)` triple that appears in the subgraph *and* is implied by consecutive steps in a scenario. A step that cites an affordance without moving anywhere covers the affordance and no transition.
- **Assertion steps** are steps whose `kind ∈ ASSERTION_KINDS` ([05 §2.5](../02-architecture/05-data-model.md)). The `2 ·` in **D** means two assertions per scenario saturates the term; there is no reward for a sixth.
- **Empty denominators** score their term at `1.0`, never `NaN`. A capability with one state and no transitions is fully state-covered by visiting it.
- **`plannedNotGenerated` scenarios count.** They are a genuine plan for a genuine flow; that they will not be compiled is the Generator's fact, not the plan's ([10 §8](10-planner.md)).

### 3.3 What the score is not

It is not a percentage of tests passing — that is the Robustness Score's Determinism term ([14 §3.2](14-quality-report-and-score.md)). It is not a claim about the application's quality. It is one thing only: **how much of what we observed does this plan intend to exercise, and in how many kinds.** Everything it does not measure is measured somewhere else and cited there.

### 3.4 Worked example — Checkout, `EC-03`

Subgraph: 4 states, 12 transitions, 21 eligible affordances (2 more were deny-listed and excluded).

**Round 0** — three happy-path scenarios, 9 distinct affordances, 5 transitions, 3 states, 4 assertions.

```
A = 9/21  = 0.4286      0.30 · 0.4286 = 0.12857
T = 5/12  = 0.4167      0.25 · 0.4167 = 0.10417
S = 3/4   = 0.7500      0.15 · 0.7500 = 0.11250
C = 1/4   = 0.2500      0.20 · 0.2500 = 0.05000
D = min(1, 4/6) = 0.6667  0.10 · 0.6667 = 0.06667
                                score = 0.4519
```

**0.4519 < 0.70**, and `classGaps()` mints two `BLOCKER`s (no negative case, no error-state case). Verdict **REPLAN**. Both reasons are recorded — a plan can fail the floor and fail on kind at the same time, and reporting only the first would teach the Planner the wrong lesson.

**Round 1** — six scenarios across all four classes, 15 distinct affordances, 9 transitions, 4 states, 11 assertions.

```
A = 15/21 = 0.7143      0.30 · 0.7143 = 0.21429
T = 9/12  = 0.7500      0.25 · 0.7500 = 0.18750
S = 4/4   = 1.0000      0.15 · 1.0000 = 0.15000
C = 4/4   = 1.0000      0.20 · 1.0000 = 0.20000
D = min(1, 11/12) = 0.9167  0.10 · 0.9167 = 0.09167
                                score = 0.8435
```

**0.8435 ≥ 0.70**, zero blockers. Verdict **PASS** — carrying four `residualGaps`, because six of twenty-one affordances are still untouched and the report is required to say so (`FR-306`).

> That last sentence is the demo. The plan passed *and* the assessment still names what is missing. A tool that reports only what it covered is the tool this project exists to argue against ([01 §2.2](../01-foundation/01-vision-and-scope.md)).

---

## 4. The blocking floor

```ts
export const COVERAGE_FLOOR = 0.70;      // packages/core/critic/src/constants.ts
```

### 4.1 Why 0.70, said honestly

0.70 is the lowest value that our seven golden fixtures agree is *"a plan a QA lead would not send back"*, and the highest value at which the deterministic fallback plan (§9) still clears on a simple capability. It is **calibrated on our eval set, not derived from a corpus** — the same honesty the healing thresholds are held to ([13 §5](13-triage-and-healing.md)).

Two properties matter more than the exact number:

- **A happy-path-only plan cannot reach it by breadth.** Perfect A, T, S and D with `C = 0.25` scores `0.30 + 0.25 + 0.15 + 0.05 + 0.10 = 0.85`, which *does* clear 0.70 — and is still rejected, because §5.3 mints a `BLOCKER` for the missing classes. **The score measures breadth; the blockers enforce kind.** Two levers, because one number cannot express both and pretending it can is how coverage metrics get gamed.
- **The floor is stored on every assessment** (`CoverageAssessment.floor`). An assessment read six months from now is still legible after the constant changes, and a floor change is visible in a diff rather than silently re-grading history.

### 4.2 Why not an adaptive floor

An adaptive floor — say, the mean score across this session's laps — is tempting: it adjusts to how explorable the application turned out to be. Its real advantage is that it never blocks a whole session on an application we simply could not see well.

We reject it because it makes the gate **non-local**: the same plan for the same capability would pass or fail depending on what happened in other laps, which breaks reproducibility (`NFR-1`), breaks the ability to unit-test `TG-5b` on one fixture, and makes the demo unrepeatable. The honest version of the adaptive idea is already in the system as `haltReason`: when we could not see much, we say we could not see much ([14 §4](14-quality-report-and-score.md)), rather than lowering the bar and reporting a pass.

---

## 5. Gaps (`FR-302`)

### 5.1 The three classes, and how to tell them apart

The brief names these three, so we use the brief's words. The distinction is not stylistic — it decides severity, and severity decides blocking.

| Class | Question it answers | Test for it |
|---|---|---|
| `MISSING_FLOW` | Is there a **path a user takes** that no scenario walks? | Names a sequence of affordances/states, at least one of which no scenario cites |
| `MISSING_EDGE_CASE` | Is there an **input or state at the boundary** of a covered flow that nothing probes? | The flow is covered; the *value* is not — empty, maximum, duplicate, zero, expired |
| `MISSING_ERROR_STATE` | Is there a way the application **says no** that nothing triggers? | Names an outcome the application produces on rejection — validation, decline, permission, timeout |

Ambiguous cases resolve by asking *what would the fixing scenario do?* — walk a new path (flow), change a value on an existing path (edge case), or provoke a refusal (error state). Every gap carries a `suggestedScenario`, which is why this test is always available.

### 5.2 Severity, and who may assign it

| Severity | Deterministic rule | Effect |
|---|---|---|
| `BLOCKER` | A required class is absent with no stated reason (§5.3) · the capability's **primary flow** — entry state to any exit condition — is not covered end to end · a PRD requirement carrying a MUST-strength verb is uncovered (§8) | Blocks `TG-5b` |
| `MAJOR` | A connected group of 3+ eligible affordances is untouched · an observed state is unreached by any scenario · the model proposed it | Counts as residual; never blocks |
| `MINOR` | A single untouched affordance · a deny-listed affordance recorded as untested | Reported |
| `INFO` | Ordering, naming, or an optional suggestion | Reported |

**Only the deterministic rules may mint or clear a `BLOCKER`.** The model's gaps are clamped to `MAJOR` on receipt, in code, before merging. That single clamp is what makes `TG-5b` model-independent, and it is the subject of [ADR-017](../decisions/ADR-017-arithmetic-blocks.md).

It cuts both ways, and the second direction matters more:

- The model **cannot block** the pipeline forever by insisting a plan is inadequate. A stuck lap is a failure mode with no recovery path on a stage timer.
- The model **cannot unblock** a plan by arguing that a missing error-state case is fine here. The blocker was minted by arithmetic and only arithmetic retires it — by the next round's plan actually containing the class.

### 5.3 `classGaps()` — the deterministic teeth

```ts
// packages/core/critic/src/class-gaps.ts — pure
export function classGaps(plan: TestPlan, sub: CapabilitySubgraph): Gap[];
```

| Rule | Class | Severity |
|---|---|---|
| No scenario with `class: "negative"`, and `plan.rationale` does not state why | `MISSING_EDGE_CASE` | `BLOCKER` |
| No scenario with `class: "error_state"`, and no stated reason | `MISSING_ERROR_STATE` | `BLOCKER` |
| No scenario with `class: "boundary"`, and no stated reason | `MISSING_EDGE_CASE` | `MAJOR` |
| No path from `entryStateId` to any exit condition is fully covered by one scenario | `MISSING_FLOW` | `BLOCKER` |
| A group of 3+ untouched eligible affordances sharing a parent state | `MISSING_FLOW` | `MAJOR` |
| An observed state cited by no scenario | `MISSING_FLOW` | `MAJOR` |
| An untouched single eligible affordance | `MISSING_FLOW` | `MINOR` |
| A `destructive` affordance recorded `observedNotExercised` | `MISSING_FLOW` | `MINOR` |

`FR-203`'s escape hatch is real and it is checked: a plan that says *"this capability is read-only; there is no negative case"* in its `rationale` satisfies the rule. The check is a keyword match on the class name within the rationale — deliberately crude, because the alternative is asking a model whether an excuse is good enough, and that is a blocking decision made by a model.

**These eight rules are the entire coverage critique when the model is unavailable.** They are not a stub. `EC-03` — a plan rejected, re-planned, and cleared — passes with the API key unset, which is the strongest single answer to *"is the Critic real?"*.

### 5.4 The semantic half — call site 3

| | |
|---|---|
| Mechanism | `messages.parse()` with `zodOutputFormat(SemanticGaps)` ([07 §2.1](../02-architecture/07-llm-integration.md)) |
| Effort | `high` · `max_tokens` 6 000 · one call, no loop |
| Shown | The plan, the subgraph, **the structural score already computed with its five terms**, the deterministic gaps already minted, and matched PRD sections |
| Returned | Gaps with class, title, why, `suggestedScenario`, `affordanceRefs`, and a proposed severity |
| Fallback | Nothing. The structural half already produced an assessment (`FR-308`) |

The structural score is computed **before** the call and included in the prompt, for the same reason the pre-classification is shown to Triage: we want the model to *add judgement to arithmetic it can see*, not to invent a number. It is told explicitly that the score is not its to change.

What we want from this half is the thing arithmetic cannot produce: *"nothing checks that the coupon is rejected when the cart falls below the minimum spend after an item is removed."* No structural rule reaches that. It is also, unavoidably, the half that varies in wording between runs — and `NFR-1` covers verdicts, not prose ([07 §9](../02-architecture/07-llm-integration.md)).

### 5.5 The merge

1. Clamp every model gap to at most `MAJOR`.
2. Drop any gap whose `affordanceRefs` do not resolve in the subgraph — a gap about a button nobody saw is a hallucination, and it gets the same treatment as one in a plan.
3. Deduplicate: two gaps of the same class whose titles have Jaccard overlap ≥ 0.7 merge, keeping the higher severity and the deterministic one's wording.
4. Sort by `(severity desc, class, title)` — total and stable.
5. Cap at **12**. A list of thirty gaps is a list nobody reads; the cap is applied after sorting, so what survives is the most severe.

---

## 6. The verdict

```ts
// packages/core/critic/src/verdict.ts — pure
export function verdict(a: CoverageAssessment, lap: LapState): "PASS" | "REPLAN" | "ACCEPT_RISK" {
  const blocked = a.gaps.some((g) => g.severity === "BLOCKER");
  if (!blocked && a.score >= a.floor) return "PASS";
  if (lap.replanRounds < MAX_REPLAN_ROUNDS) return "REPLAN";
  return "ACCEPT_RISK";
}
```

Which is `TG-5b` and `TG-6` from [04 §3.3](../02-architecture/04-system-architecture.md), stated once in the Critic's own terms. Three outcomes, all recorded:

| Verdict | Next state | What the report says |
|---|---|---|
| `PASS` | `GENERATING` | The plan cleared the floor; these gaps remain (`residualGaps`) |
| `REPLAN` | `PLANNING`, carrying `gaps[]` | The plan was rejected; here is the round-0 → round-1 diff |
| `ACCEPT_RISK` | `GENERATING`, `lap.acceptedRisk = gaps` | The cap was spent; these gaps are shipped as **accepted risk**, named |

`ACCEPT_RISK` is what keeps this honest. After two rounds we proceed with the gaps **written into the report**, rather than looping until something looks good enough to pass.

---

## 7. The re-plan loop (`FR-304`, `FR-305`)

### 7.1 What is carried back

The `Gap` objects themselves — class, title, why, `suggestedScenario`, `affordanceRefs` — not a prose summary. The Planner receives them as `carriedGaps` ([06 §4.2](../02-architecture/06-agent-contracts.md)) and is asked to address them specifically, alongside the previous round's scenarios so that ids survive ([10 §5](10-planner.md)).

Rounds are **kept, never overwritten**: `test_plans` has a unique index on `(lap_id, round)` and `coverage_assessments` is 1:1 with a plan (`I-11`). Round 0 and its rejection are the evidence for `S-2`; a model that overwrote them would destroy the demo beat it produced.

### 7.2 The cap, and why it is 2

`MAX_REPLAN_ROUNDS = 2`, enforced by the FSM **and** a `CHECK` constraint on `laps.replan_rounds` (`I-12`). Three plans maximum per capability: round 0, and up to two revisions.

Two, not three, because of the lap budget: three planning calls at ~6 s plus three critiques at ~4 s is 30 s of a 90-second lap (`P-2`) spent before a single line of code exists. And two is enough to demonstrate the property — the second plan clearing the floor is the observable behaviour `M4` asks for; a third round demonstrates nothing new and costs a capability.

### 7.3 Why padding does not work

The obvious attack on any coverage gate is to pad: add scenarios until the number moves. Three properties block it, and they were designed in rather than discovered:

1. **A, T and S count distinct references.** Five scenarios clicking the same button raise nothing.
2. **D saturates at two assertions per scenario.** Adding assertions to an existing scenario stops helping immediately; adding empty scenarios *lowers* D, because `scenarios` is in the denominator.
3. **C is capped at 4 classes.** A sixth `happy` scenario contributes nothing to the term the blockers care about.

And the Planner is never told the floor ([10 §3.1](10-planner.md)), so it is not optimising against a number it can see.

### 7.4 Anti-stall

A round that does not improve the score is still consumed. The `critique.replan` event payload carries `{ round, score, previousScore, improved }`, so a no-progress round is visible in the timeline and in the report rather than being detected by a human noticing the numbers look similar. There is no mechanism that grants an extra round for trying hard; the cap is a counter, not a negotiation ([ADR-008](../decisions/ADR-008-orchestration-topology.md)).

---

## 8. PRD gap analysis (`FR-307` — the brief's Bonus `B1`)

When a PRD is supplied, the Critic answers a second and different question: not *"what does the application let us do that we are not testing?"* but *"what did someone say this should do that nothing checks?"*

### 8.1 The pipeline

1. **Sectioning.** Split Markdown or plain text on headings; each section gets a stable `prdSectionRef` of its heading path plus ordinal — `§3.2 Checkout / Coupons`. PDF is deliberately not an MVP input: when added, extraction runs in a sandbox and yields the same plain-text shape before this stage. No parser is allowed to execute document content.
2. **Requirement extraction.** Sentences containing a normative verb are requirements. The lexicon is a unit-tested constant, and the verb sets the severity ceiling:

   | Verb form | Severity if uncovered |
   |---|---|
   | `must`, `shall`, `is required to`, `cannot` | `BLOCKER` |
   | `should`, `is expected to` | `MAJOR` |
   | `may`, `can optionally` | `MINOR` |

3. **Matching.** A requirement is covered when a scenario cites its section in `sourceRefs` (`FR-207`), **or** the Jaccard token overlap between the requirement and the scenario's `title + expectedOutcome` is ≥ 0.50.
4. **Model-assisted matching.** The uncovered set goes to the Critic call, which may propose `{ requirement, coveredByScenarioId }` pairs. Each proposal is **verified before it is accepted**: the scenario id must exist in this plan, and its `expectedOutcome` must share at least one content token with the requirement. An unverified match is discarded.
5. **Blocking.** The `BLOCKER` rule then runs over the *verified* match set.

Step 4 is where the design could have leaked. Letting the model say *"SC-014 covers that"* and believing it would hand the model a way to clear a blocker with an assertion — precisely what §5.2 forbids. Verified matching keeps the model in the role of a proposer whose proposals are checked, which is the role it has everywhere else in this system.

### 8.2 Output and honesty

`CoverageAssessment.prdGaps[]` names the requirement, its section, and its severity. Capped at 15, sorted by severity.

Stated plainly: **this is lexical analysis of prose.** On a well-structured PRD with numbered requirements it is genuinely useful. On a discursive product brief full of background and rationale it over-reports, because the extractor cannot tell a requirement from a description of a competitor's feature. The cap and the severity sort keep an over-report readable; a hard claim of completeness would not survive contact with a real PRD, so we do not make one. Future semantic/vector matching may propose matches, but it can never be the only traceability mechanism: every accepted link still passes the verification in step 4.

---

## 9. The deterministic fallback (`FR-308`, `NFR-2`)

The stage **is never skipped**. What changes with no model:

| | With the model | Without |
|---|---|---|
| `score` | Identical | Identical — it was never the model's |
| `floor`, `verdict` | Identical | Identical |
| `BLOCKER` gaps | From `classGaps()` | From `classGaps()` — unchanged |
| `MAJOR`/`MINOR` gaps | Deterministic rules, plus judgement gaps | Deterministic rules only |
| Gap wording | Fluent, specific | Templated: *"3 affordances in state st_… are untouched: Coupon code, Apply, Cancel order"* |
| `prdGaps` | Deterministic match, model-verified additions | Deterministic match only — more false positives |
| `source` | `"llm+deterministic"` | `"deterministic"` |

The property to state out loud: **`EC-03` passes with the key unset.** The plan is rejected, the Planner is re-invoked with named gaps, and the second plan clears the floor — with no model in the loop at any point. The re-plan loop is a control, not a conversation.

---

## 10. Why not the alternatives

### Not an LLM-as-judge critic

**Its real advantage:** it catches everything arithmetic cannot — domain semantics, business rules, the scenario a thoughtful tester would think of on a Tuesday. It needs no denominator, no subgraph, no rules to maintain. For pure gap *discovery* it is better than what we built, and that is exactly why it is half of our Critic.

**Why it is not the gate:** it cannot answer *"would it block the same plan twice?"* with a yes. `FR-303` requires reproducibility from stored inputs, `TG-5b` is a unit test, and `NFR-2` requires the gate to work with no API key. A judge who asks *"what actually stops a bad plan?"* and is shown a prompt has been shown a hope. We keep the model where it adds and remove it from where it decides.

### Not code coverage

**Its real advantage:** it is the industry's shared vocabulary, objective, and instantly credible in a room of engineers.

**Why not:** we are black-box against *any URL* — there is nothing to instrument, and instrumenting the target would break the central promise that nothing about a specific application is hardcoded. More fundamentally, line coverage of the application is not coverage of what a user can *do*: a single React component can serve six capabilities, and covering its lines tells you nothing about which of the six you tested.

### Not "percentage of scenarios passing"

**Its real advantage:** trivially computed, and it is the number a stakeholder already believes they want.

**Why not:** it measures the health of the suite you wrote, not the breadth of the suite you should have written — and it is 100% on a suite of one happy-path test. It is a real signal and it is in the system, as the Determinism and Integrity terms of the Robustness Score ([14 §3.2](14-quality-report-and-score.md)), which is where an outcome metric belongs.

---

## 11. Known limitations

| Limitation | Impact | What we do about it |
|---|---|---|
| The denominator is what the Explorer saw | A capped crawl makes a thin plan look well-covered | `haltReason` travels into the report and limits what the coverage claim is allowed to say ([14 §4](14-quality-report-and-score.md)) |
| The floor is tuned on seven fixtures | 0.70 is defensible, not universal | Stated. One exported constant, one test, cheap to re-fit against real sessions |
| Four classes is a coarse taxonomy | Accessibility, performance and security cases have no class of their own | Deliberate for this build; they arrive as `MAJOR` semantic gaps rather than being silently absent |
| The `FR-203` escape hatch is a keyword match | A plan could satisfy it with a hollow sentence | Accepted: the alternative is a model deciding whether an excuse is good enough, which is a blocking decision by a model |
| Gap severity above `MAJOR` is unreachable for judgement gaps | A genuinely critical semantic gap does not block | The correct trade. A false block costs one round; a model that can block costs reproducibility ([ADR-017](../decisions/ADR-017-arithmetic-blocks.md)) |

---

## 12. Budgets (`NFR-3`)

| Operation | p50 | p95 | Cap | On cap |
|---|---|---|---|---|
| `structuralScore` | 2 ms | 5 ms | 100 ms | pure — cannot bind |
| `classGaps` | 3 ms | 8 ms | 100 ms | pure |
| PRD extraction + deterministic match | 40 ms | 120 ms | 1 s | Partial requirement set, flagged |
| `semanticGaps` (call site 3) | 4 s | 10 s | 15 s | Deterministic assessment only, `source: "deterministic"` |
| Merge, verdict, persist | 4 ms | 10 ms | 100 ms | pure |
| **The whole stage** | **~4 s** | **10 s** | **15 s** | The stage still emits an assessment. It is never skipped. |

---

## 13. Related documents

- What it critiques, and what a rejection sends back → [10 · Planner](10-planner.md)
- What a passing plan becomes → [12 · Generator](12-generator.md)
- Where residual gaps and accepted risk surface → [14 §2, §4](14-quality-report-and-score.md)
- The guards this document implements → [04 §3.3](../02-architecture/04-system-architecture.md) (`TG-5b`, `TG-6`)
- The shapes → [05 §2.6](../02-architecture/05-data-model.md)
- Call site 3's mechanics → [07 §2.1, §3.3](../02-architecture/07-llm-integration.md)
- Why only arithmetic may block → [ADR-017](../decisions/ADR-017-arithmetic-blocks.md)
