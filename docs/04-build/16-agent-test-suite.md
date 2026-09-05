# 16 · Agent Test Suite

> **This document is written before the agent it tests, and that ordering is the point.** Every assertion below is a decision made while it is still cheap to change — which is why writing it surfaced two contradictions in the upstream specification (§11) rather than discovering them at hour six.
> **"It worked in the demo" is not evidence.** When a judge asks *"does it do that reliably, or did it do that once?"*, the answer has to be a command.
> **This document owns:** the `EC-nn` golden cases, the `R-n` rehearsals, the fixture harness, the determinism gate, and the unit inventory.
> **Supersedes** the pre-brief `15-testing-and-evals`. The seven case ids are retained; five of the seven now test something else, because the pipeline they tested no longer exists.

---

## 1. Three claims, three mechanisms

Conflating these is how test suites become theatre.

| The claim | Proven by | Where |
|---|---|---|
| *"The arithmetic is right"* | Pure unit tests. No browser, no model, sub-second | §8 |
| *"The loop reaches the right verdict"* | Seven golden cases through the real orchestrator | §5 |
| *"It reaches it every time"* | The same cases, replayed from fixtures, five times | §4 |
| *"It reaches it on an application we have never seen"* | Rehearsal `R-3` | §9 |

The third is the claim most teams skip and the one that decides whether the demo survives a cold machine. The fourth is the one that separates a pipeline from a fixture.

---

## 2. The four tiers

| Tier | What runs | Location | Budget | Needs |
|---|---|---|---|---|
| **Unit** | Pure functions against literals | `packages/*/src/**/*.test.ts` | **< 5 s** | nothing |
| **Contract** | Pure functions against recorded fixtures | `packages/*/test/contract/**` | < 15 s | `fixtures/` |
| **Replay** | The **real** orchestrator, FSM and guards, over recorded model and tool transcripts | `packages/evals` · `forge eval --tier replay` | **< 30 s** for all seven | `fixtures/` |
| **Live** | Everything, against Chromium and a running target | `forge eval --tier live` | < 12 min for all seven | browser + target (+ key) |

**Tier is a property of the run, not of a case.** All seven golden cases exist in both replay and live form. `pnpm verify` runs the replay tier — no browser, no API key, under a minute — and the live tier runs at phase gates, in the `golden` CI job and before the freeze. A gate that takes twelve minutes is a gate people stop running; a gate that takes thirty seconds is one they run on every save.

The unit budget is load-bearing. `packages/core` is pure by build enforcement ([15 §2.2](15-repo-and-conventions.md)), so roughly ninety tests covering the coverage score, the pre-classifier, all six healing signals, all five vetoes and the report arithmetic run in under a second. That is what makes it possible to change a weight at hour six and know within one second whether the number spoken on stage is still `0.891`.

---

## 3. The recorded-fixture harness

### 3.1 Two seams, and no third

A test double is a lie about the system. The fewer we tell, the more the suite is worth. FORGE has exactly two boundaries where the outside world enters, and the architecture already isolates both:

| Seam | Real implementation | Recorded implementation | Why it is a clean seam |
|---|---|---|---|
| **The model** | `AnthropicClient`, reached only from `packages/agents/harness` | `RecordedModelClient` | The `one-model-client` import rule guarantees there is no second door ([15 §2.2](15-repo-and-conventions.md)) |
| **The tools** | `packages/runner`, `packages/perception` | `ReplayToolset` | Every tool returns `ToolResult<T>` and **never throws** ([06 §1](../02-architecture/06-agent-contracts.md)), so a recorded value is indistinguishable from a live one |

Everything between those two seams runs for real in the replay tier: the FSM, all eleven guards, the lap scheduler, the structural critic, the compiler, the pre-classifier, the six-signal scorer, the veto ladder, the patcher, the report arithmetic, the store. **The replay tier is not a simulation of the pipeline. It is the pipeline, with the network unplugged.**

That property is bought by two decisions made in Batch 2 for other reasons, and it is worth naming the dividend: the no-throw law makes a recorded failure a first-class value, and forbidding `agents/* → store` means a sub-agent has no hidden channel through which replay could diverge from live.

### 3.2 Transcript fixtures — the model, recorded

```
fixtures/transcripts/planner/EC-03.jsonl
```

One JSONL entry per model exchange:

```jsonc
{ "key": "a91c4f2e…",                    // sha256, §3.4
  "agent": "planner", "turn": 0,
  "response": { "stop_reason": "tool_use",
                "content": [{ "type": "tool_use", "name": "emit_test_plan",
                              "input": { /* the structured output, verbatim */ } }] },
  "usage": { "input_tokens": 4211, "output_tokens": 903, "cache_read_input_tokens": 3980 } }
```

`RecordedModelClient` implements the same interface as the real client and is injected through `AgentContext`. On a hit it returns the recorded response; on a miss its behaviour depends on `FORGE_FIXTURES`:

| Mode | On a miss |
|---|---|
| `replay` | **Fail the case**, naming the missing key and the agent. A silent fallback to a live call would make CI depend on the network without anyone noticing |
| `record` | Call the real model, append the exchange, continue |
| `off` | Not installed at all — the real client is used |

Recorded responses are **verbatim**, including malformed ones. `EC-03`'s transcript deliberately contains a schema-invalid first emit, so the harness's one repair retry ([06 §2.1](../02-architecture/06-agent-contracts.md)) is exercised by a real invalid payload rather than by a hand-written approximation of one.

### 3.3 Tape fixtures — the browser, recorded

```
fixtures/tapes/EC-05.jsonl
```

One entry per tool call, in call order:

```jsonc
{ "key": "6b0d…", "seq": 41,
  "tool": "click", "args": { "locator": "locator('#place-order')" },
  "result": { "ok": false,
              "error": { "code": "LOCATOR_NOT_FOUND",
                         "message": "resolved to 0 elements",
                         "detail": { "resolvedCount": 0 } },
              "evidenceIds": ["ev_…", "ev_…", "ev_…"], "durationMs": 812 },
  "evidence": { "ev_…": "fixtures/tapes/EC-05/ev_…json" } }
```

A tape carries its evidence alongside it — snapshots, DOM hashes, console and network deltas, bounding boxes — because a diagnosis that cites three evidence ids (`FR-602`, `I-8`) must be able to resolve them in replay or the assertion is hollow.

**What this buys.** `EC-05`'s heal is arithmetic over a fingerprint and a set of live-resolved candidates. Both are in the tape. So the replay run computes `0.891` through the real scorer, from the real recorded page, with no browser — in about forty milliseconds.

### 3.4 Key derivation, and why it includes an index

```ts
key = sha256([
  caseId,
  toolOrAgent,                 // "click" | "planner"
  canonicalJson(args),         // keys sorted, floats fixed to 6dp
  stateSignature ?? "",        // the perceived state this call was made from
  callIndex,                   // nth identical call within this case
].join("|")).slice(0, 16);
```

`callIndex` is not defensive padding. The Runner calls `snapshot()` twice from the same state during post-heal verification, and the two calls must return the *pre-heal* and *post-heal* pages. Keying on arguments alone would return the first recording both times and `TG-10` would verify against a stale page — a green replay for a heal that never worked. `stateSignature` is included so that a tape entry recorded from a different state can never be silently reused.

### 3.5 Recording

```bash
forge eval --case EC-05 --tier live --record      # runs live, writes a tape and transcripts
forge fixtures:record --case EC-05                # promotes artifacts/ → fixtures/, reviewable in git
```

Two rules keep tapes honest:

1. **A tape is promoted only from a run that passed live.** Recording a failing run bakes the failure into the gate.
2. **Tapes are reviewed in the diff like any other source.** A re-recorded `EC-05` whose diff shows a changed score is either an intended change or a regression, and either way somebody looks at it.

### 3.6 Snapshot fixtures — for the pure functions

```
fixtures/perception/{aperture-checkout,saucedemo-login,conduit-editor}.snapshot.yaml
```

Accessibility snapshots plus DOM facts, feeding `detectLoginForm()`, `stateSignature()`, `affordancesOf()` and the deny-list — with no browser at all. Three structurally different login pages, one detector, zero configuration is `FR-101`'s acceptance criterion, and it is checkable in a unit test that runs in three milliseconds ([09 §2.1](../03-algorithms/09-exploration-and-prioritisation.md)).

### 3.7 What the harness refuses to fake

| Not faked | Because |
|---|---|
| The orchestrator, the FSM, the guards | An eval suite that runs a parallel code path proves the parallel code path works |
| The store | `FR-903`'s restart guarantee is a property of persistence; an in-memory double would assert nothing |
| Any arithmetic | Scores, vetoes and the report are the thing under test |
| The target's DOM | The DOM contract *is* what breaks. A mocked DOM tests our mock ([19 §3](19-target-apps.md)) |

---

## 4. What "deterministic" means here

`NFR-1` promises **verdict determinism**, not output determinism ([07 §9](../02-architecture/07-llm-integration.md)). Being precise about the difference is what keeps the gate from either flaking or being meaningless.

### 4.1 The verdict tuple — the only thing `--repeat` compares

```ts
type Verdict = {
  session:  { status: SessionStatus; exitCode: 0|1|2|3; defectsFound: number };
  backlog:  string[];                       // capability names in rank order — I-17
  laps: Array<{
    capability:      string;
    replanRounds:    0 | 1 | 2;
    assessmentScore: number;                // 4 dp, per round
    assessmentVerdict: "PASS" | "REPLAN" | "ACCEPT_RISK";
    blockerCount:    number;
    scenarioIds:     string[];              // sorted
    outcome:         LapOutcome;
    diagnoses:       Array<{ stepId: string; kind: DiagnosisKind; vetoes: string[]; final: boolean }>;
    heals:           Array<{ stepId: string; strategy: string; topScore: number;  // 1e-6
                             margin: number; patchApplied: boolean; rolledBack: boolean }>;
  }>;
  score: { current: number; components: Record<string, number> };   // I-19
};
```

**Explicitly excluded:** every `explanation`, every gap `title` and `why`, the developer summary, latency, token counts, and every ULID. Those vary between runs and that is correct — they are presentation, not decision.

### 4.2 Two tiers of determinism, stated separately

The pre-brief edition claimed one thing where two are true, and the difference is exactly where a CI job flakes.

| | **D1 · Replay determinism** | **D2 · Live stability** |
|---|---|---|
| Run as | `forge eval --tier replay --repeat 5` | `forge eval --tier live --repeat 3` |
| Compared | **The whole verdict tuple, byte-equal** | `status`, `exitCode`, `backlog`, `outcome`, `kind`, `vetoes`, `patchApplied` |
| May differ | Nothing | `assessmentScore`, `scenarioIds`, `replanRounds` |
| Is it a gate? | **Yes.** Any difference fails the build | Reported, not gated |

**Why the split is honest rather than convenient.** `assessmentScore` is arithmetic over a plan, and with a live model the plan is not byte-stable — a Planner that phrases a scenario differently changes the affordance count and therefore the score. The *healing* score is different: it is arithmetic over captured evidence, so it must not move even in D2. Any variation in `topScore` across a live repeat is a **bug, not flake** — usually an unfrozen input leaking into a signal, most often a bounding box measured before fonts settled.

That gives the gate its precise wording: *"With the model replayed, five runs are byte-identical. With the model live, the verdicts and the backlog order are identical and the plan wording is not."* That sentence is defensible to a technical judge. *"Our output is deterministic"* is not.

---

## 5. The seven golden cases

Each is a JSON file in `fixtures/golden/`. Every case runs from a cold `forge reset` with `FORGE_SEED=20260905`, so no case depends on any other having run.

| ID | Story | Given | Terminal | Exit |
|---|---|---|---|---|
| **EC-01** | **Cold start.** A URL in, a full suite and a report out, nothing broken | none | `COMPLETED` | 0 |
| **EC-02** | **Exploration with the model gone.** Map, cluster and rank with the key unset | `FORGE_LLM_ENABLED=false` | `COMPLETED` | 0 |
| **EC-03** | **The Critic sends a plan back**, and the revision clears the floor | planner transcript | `COMPLETED` | 0 |
| **EC-04** | **Both ceilings.** Two re-plan rounds spent → accepted risk; an ambiguous heal → escalate | `M-05` + transcript | `ESCALATED` | 2 |
| **EC-05** | **One lap heals a broken address and refuses a false claim** | `M-01` + `M-03` | `COMPLETED` | 1 |
| **EC-06** | **Two refusals, two reasons, one session** | `M-12` · `M-01`+`M-02` | `COMPLETED` | 1 |
| **EC-07** | **The deliverable.** Runtime defect, report, score, portable suite from a cold clone | `M-06` | `COMPLETED` | 1 |

**Four of seven exit non-zero, and that is the point.** Exit 1 means FORGE found a real defect and proved it; exit 2 means it correctly declined to guess. CI treats 0, 1 and 2 as valid outcomes and only 3 — harness error — as failure ([04 §3.4](../02-architecture/04-system-architecture.md)).

Two named variants run in CI but are **not** part of the 7/7 gate: `EC-01-par` (the same session with `workers: 4`, asserting `FR-506`'s ≥40% wall-clock reduction with identical verdicts) and `EC-07-alt` (`M-07`, exercising `V5`'s console arm rather than its 5xx arm).

---

### EC-01 · Cold start — the whole pipeline, nothing broken

**Given** `forge reset`, T1 at `http://localhost:4100/`, credentials supplied, no mutations, no intent, no PRD.

| Assertion | Expected | Requirement |
|---|---|---|
| Session starts with **no second call** | `CREATED → EXPLORING` within 2 s of the `201` | `FR-001`, `FR-002`, `TG-1` |
| Capability map | ≥ 11 states, ≥ 14 transitions, every state carries a 16-char signature | `FR-103`, `TG-2` |
| Backlog order | Checkout · Sign-in · Account Orders · Cart · Browse | `FR-902`, `I-17` |
| Laps banked | 5 of 5, every one `BANKED` with exactly one outcome | `FR-902`, `I-15` |
| Every lap | has a `CoverageAssessment` for its final plan | `FR-301`, `TG-5b`, `I-11` |
| Generated suite | one spec file per capability, zero cross-capability imports | `FR-408` |
| Every emitted locator | `resolvedCount === 1` at generation time | `FR-402`, `TG-7` |
| Every emitted assertion | passed live before the file was written | `FR-403` |
| Every `click`/`fill` step | non-null `fingerprintId` before the first run | `FR-406` |
| Evidence | ≥ 5 rows per executed step; every path contains its own sha256 prefix | `FR-502`, `FR-505`, `I-2` |
| Trace | `artifacts/sessions/<id>/trace.zip` exists and opens in Trace Viewer | `FR-503` |
| Report | all five mandated contents populated | `FR-801`, `I-18` |
| Heal attempts | **0** | — |
| Two consecutive runs | identical verdict tuples | `FR-501`, `NFR-1` |
| First capability planned | within **60 s** of the `201` | `P-1` |
| Whole session | under **360 s** serial | `P-2` |
| Exit | 0 | `FR-904` |

**EC-01 fails first when something environmental has drifted**, which is why it runs first. A red EC-01 means *stop and check the machine*, not *debug the healer*.

---

### EC-02 · Exploration with the model unavailable

**Given** `forge reset`, T1, `FORGE_LLM_ENABLED=false`, `ANTHROPIC_API_KEY` unset. The case is `forge explore`, not a full session.

| Assertion | Expected | Requirement |
|---|---|---|
| Login detected with no configuration | `detectLoginForm` confidence `1.00`; `authenticated: true` | `FR-101` |
| `storageState` written once and reused | `.auth/state.json` exists; zero re-logins during the crawl | `FR-102` |
| Snapshot size | < 8 KB per state, against a 200 KB raw DOM | `FR-104` |
| Capabilities | 5, each with a name, a description, an entry state and ≥ 1 exit condition | `FR-105` |
| Deny-list | *Place order* recorded `destructive: true` **and** `observedNotExercised: true` | `FR-106`, `I-20` |
| Termination | `haltReason: "EXHAUSTED"` inside the budget | `FR-107` |
| Deduplication | the three `/product/:sku` pages collapse to **one** state with `visitedVariants: 3` | `FR-108` |
| Ranking | identical order across **5** invocations of `rank()` on the stored map | `I-17` |
| Frontier choice source | `deterministic` — the value sort, not a model | `NFR-2` |
| Model calls made | **0** | — |
| Exit | 0 | — |

The last two rows are the case's whole reason to exist: exploration's *scaffold* is deterministic and only its *pointing* is agentic ([09 §3.1](../03-algorithms/09-exploration-and-prioritisation.md)). With the model gone the map comes out a little wider and a little less pointed, and everything downstream still works.

---

### EC-03 · The Critic sends a plan back — the brief's `M4`

**Given** `forge reset`, T1, `intent: "focus on checkout"`, `budget.maxCapabilities: 1`, and a planner transcript whose round 0 is three happy-path scenarios.

| Assertion | Expected | Requirement |
|---|---|---|
| Round 0 structural score | **0.4519** exactly (4 dp) | `FR-303` |
| Round 0 term breakdown | `A 9/21 · T 5/12 · S 3/4 · C 1/4 · D 4/6` | `FR-303` |
| Round 0 blockers | 2 — no `negative` case, no `error_state` case | `FR-302`, `FR-203` |
| Round 0 verdict | `REPLAN`, and **both** reasons recorded (floor *and* class) | `FR-304` |
| Blocker provenance | every `BLOCKER` was minted by the arithmetic half | [ADR-017](../decisions/ADR-017-arithmetic-blocks.md) |
| Planner input on round 1 | carries `gaps[]` verbatim | `FR-304`, `TG-6` |
| Scenario id stability | ids preserved for scenarios whose steps are unchanged | `FR-205`, `I-14` |
| Round 1 score | **0.8435** exactly | `FR-303` |
| Round 1 verdict | `PASS`, with **4 `residualGaps`** | `FR-306` |
| Round 0 plan retained | `test_plans` holds rounds 0 and 1; round 0 is not overwritten | `I-11` |
| Markdown | `plans/checkout.md` regenerates byte-identically from the JSON | `FR-202` |
| Exit | 0 | — |

**`EC-03` passes with the API key unset.** The plan is rejected, the Planner is re-invoked with named gaps, and the second plan clears the floor — with no model in the loop at any point, because the blocking half is arithmetic and the Planner falls back to the affordance-derived template plan ([11 §9](../03-algorithms/11-coverage-critic.md)). That is the strongest single answer to *"is the Critic real, or is it a prompt?"*

---

### EC-04 · Both ceilings, and what happens when they are reached

**Given** `forge reset`, T1, `M-05` enabled, `budget.maxCapabilities: 2`, and a planner transcript that under-plans the Account capability on all three rounds.

| Assertion | Expected | Requirement |
|---|---|---|
| `replanRounds` | exactly **2**, never 3 | `FR-305`, `I-12` |
| Verdict after the cap | `ACCEPT_RISK`, not `REPLAN` and not a silent pass | `FR-305` |
| `Lap.acceptedRisk[]` | non-empty, and rendered in the report **separately** from `residualGaps` | `FR-305`, [14 §2](../03-algorithms/14-quality-report-and-score.md) |
| Generation still happened | the capability produced a suite with its gaps disclosed | `TG-5b` third branch |
| Eligible heal candidates | exactly 2, both `resolvedCount === 1` | `FR-701`, `I-5` |
| Their scores | ≈ 0.72 and ≈ 0.70, both inside the review band | `FR-703` |
| Margin | **< 0.05** | `FR-703` |
| Veto fired | **V4** | `FR-704` |
| Adjudicate call site | invoked exactly once (the band condition was met) | call site 5 |
| Outcome | **`ESCALATED`** — never a coin flip | `FR-703` |
| `patchApplied` | `false`; `git diff` on the generated suite is **empty** | — |
| Heal attempts | ≤ 2 per step, ≤ 3 per lap | `FR-708`, `I-4` |
| Escalation card | names `V4` and shows both candidates with all six sub-scores | [13 §14.2](../03-algorithms/13-triage-and-healing.md) |
| Exit | 2 | `FR-904` |

**The re-plan-cap arm is transcript-driven, and it has to be.** A competent Planner clears the floor on round 1 — that is the behaviour `EC-03` asserts and the behaviour we want. You cannot reliably test a ceiling using a component that is trying not to hit it. The fixture exists so the ceiling is exercised on purpose, and the live tier asserts only `replanRounds ≤ 2` plus the `V4` escalation.

**Escalation is not a degraded outcome.** It is the correct engineering behaviour when two elements are equally plausible, and *"the honest answer was: ask a human"* is a stronger beat on stage than a third green tick.

---

### EC-05 · One lap heals a broken address and refuses a false claim

**Given** `forge reset`, T1, `M-01` **and** `M-03` enabled, `intent: "focus on checkout"`, `budget.maxCapabilities: 1`.

One lap. Two failures. Opposite verdicts. This is the case that proves the two halves of the product are one mechanism rather than two features.

**Arm A — `SC-001 · s4`, the CTA address broke:**

| Assertion | Expected | Requirement |
|---|---|---|
| Tool error | `LOCATOR_NOT_FOUND`, `resolvedCount: 0` | [06 §5.2](../02-architecture/06-agent-contracts.md) |
| Pre-classification | `LOCATOR_BREAK`, `final: false` — row 6 | `FR-604` |
| `Diagnosis.kind` · confidence | `LOCATOR_BREAK` · ≥ 0.90 | `FR-601`, `FR-602` |
| `evidenceIds` | ≥ 3, all resolving to stored rows | `FR-602`, `I-8` |
| Candidates | ≤ 5, deduplicated, all `resolvedCount === 1` | `FR-701`, `I-5` |
| Winner | `getByRole('button', { name: 'Place order' })` | — |
| **Score** | **0.891 ± 1e-6** | `FR-702` |
| Sub-scores | `sem 1.00 · role 1.00 · text 1.00 · dom 0.95 · geo 0.98 · hist 0.00` | `FR-702` |
| Runner-up · margin | `0.800` · `0.091` > 0.05 | `FR-703` |
| Vetoes | **none** | `FR-704` |
| Patch | plan patched, spec regenerated, `Scenario.version` 1 → 2 | `FR-706`, `I-10` |
| `git diff` on the generated suite | **non-empty** | `FR-706` |
| `TestPatch.diff` | parses as a valid unified diff | `FR-709` |
| Verification | `healedStepRerun` **and** `fullFlowRerun` both true | `FR-707`, `TG-10`, `I-7` |
| Heal duration | **< 10 000 ms** | `P-3` |

**Arm B — `SC-002 · s5`, the total is wrong:**

| Assertion | Expected | Requirement |
|---|---|---|
| Tool error | `ASSERTION_FAILED` — the element was **found** | [06 §5.3](../02-architecture/06-agent-contracts.md) |
| Vetoes | **`V1` and `V3`**, both recorded | `FR-704` |
| `Diagnosis.kind` | `PRODUCT_BUG`, `final: true` | `FR-601`, `I-6` |
| **Candidates emitted** | **zero** — healing is never attempted | `FR-705`, `I-3` |
| `defectReport` | all three fields; `expected "Order total ₹999"`, `actual "Order total ₹9,999"` | `FR-606` |
| `explanation` | ≤ 400 characters | `FR-602` |
| Model calls for this failure | **0** — a `final` pre-classification skips call site 4 | `FR-604` |

**Session:** `COMPLETED`, `defectsFound: 1`, exit **1**. Lap outcome `DEFECT_FOUND`, with the heal recorded as verified.

**The score assertion is the most valuable line in this document.** `0.891` is printed in the decision inspector and spoken aloud on stage. Asserting it to `1e-6` across all six sub-scores means the table a judge reads is a tested artefact, not a screenshot someone tuned by hand.

**Why not higher than 0.891.** `historical` is necessarily `0.00` on a first encounter, which caps *any* first heal at 0.90 ([13 §8.7](../03-algorithms/13-triage-and-healing.md)). A first heal above 0.90 is a scorer bug, and this is where we would catch it. Re-running EC-05 a second time engages `historical` and the same match scores higher — asserted as `FR-711` by `EC-05-repeat`, which also toggles `M-11` so a *second* element accumulates an identity.

---

### EC-06 · Two refusals, two reasons, one session

**Given** `forge reset`, T1, `M-12` enabled **and** `M-01`+`M-02` enabled, `budget.maxCapabilities: 2` (Checkout and Sign-in).

Two laps, two `PRODUCT_BUG` verdicts, arrived at by two entirely different routes. Neither is a low-confidence rejection.

**Sign-in lap — `V1`, the assertion veto:**

| Assertion | Expected | Requirement |
|---|---|---|
| Failing step | an `assertText` on the invalid-credentials error region | — |
| Tool error | `ASSERTION_FAILED`; expected `"Invalid email or password"`, actual `""` | — |
| Veto | **`V1` alone** — `V3` cannot fire, the delta is non-numeric | `FR-704` |
| Candidates emitted | **zero** | `FR-705` |
| `Diagnosis.kind` | `PRODUCT_BUG`, `final: true` | `I-6` |
| Defect report | names the silent login failure with reproduction steps | `FR-606` |

**Checkout lap — `V2`, the destructive-verb veto:**

| Assertion | Expected | Requirement |
|---|---|---|
| Original locator | resolves to 0 → `LOCATOR_NOT_FOUND` | — |
| Best candidate | accessible name `"Delete order"`, score **≈ 0.71** | `FR-702` |
| Score band | **above** the 0.65 review threshold — a similarity-only healer takes it | — |
| Veto | **`V2`** | `FR-704` |
| `Diagnosis.kind` | `PRODUCT_BUG`, `final: true` | `I-6` |
| `patchApplied` | `false`; `git diff` on the generated suite **empty** | `S-4` |
| Verdict card | veto banner naming `V2` **and the score it overrode** | [18 §5.3](18-ui-spec.md) |

**Session:** `COMPLETED`, `defectsFound: 2`, exit **1**.

**The ≈0.71 assertion is the whole case.** A blocked heal at 0.30 proves nothing — any threshold catches it. Blocking at 0.71, well inside the band where a confidence-driven healer proceeds, is what makes the sentence true:

> *"Our similarity score said 0.71. Our veto said no. **The veto wins.**"*

If a refactor drops that score below 0.65, this test must fail loudly, because the demo's most quotable claim would have quietly become a coincidence.

**Why `M-12` and not the price mutation for `V1`.** The pre-brief edition proved `V1` with the price change, which fires `V1` and `V3` together — so deleting `V1` entirely left the case green. `M-12` breaks an assertion non-numerically, which makes `V1` the only thing standing between us and a healer that rewrites a truth claim ([19 §5.2](19-target-apps.md)).

---

### EC-07 · The deliverable

**Given** `forge reset`, T1, `M-06` enabled (`POST /api/orders` → 500), full session, no capability budget.

| Assertion | Expected | Requirement |
|---|---|---|
| New 5xx since baseline | ≥ 1, on a request path used by the flow | `FR-502` |
| Veto | **`V5`** | `FR-704` |
| `Diagnosis.kind` | `PRODUCT_BUG` — **not** `ENVIRONMENT` | `FR-601` |
| Runtime signals stored | `5xx 1 (+1)` — the delta, not the absolute | — |
| Report contents | all five brief-mandated fields populated | `FR-801`, `I-18` |
| `residualGaps` and `acceptedRisk` | rendered as **two** sections, never merged | [14 §2](../03-algorithms/14-quality-report-and-score.md) |
| Robustness Score | `current` recomputes exactly from stored rows | `FR-802`, `I-19` |
| Score delta | `projected` present; every finding carries `pointsIfFixed` | `FR-803` |
| Per-capability table | every capability attributed, unreached ones at 0.00 | `FR-806` |
| Untested flow risk | ranked by `riskScore`, never alphabetical | `FR-804` |
| `haltReason` language | the report's claim matches the enum's permitted sentence | [14 §4.1](../03-algorithms/14-quality-report-and-score.md) |
| Three renderings | JSON, Markdown and HTML agree field for field | `FR-805` |
| `hoursSaved` | present with ≥ 1 assumption, or `null` below 5 banked scenarios | `FR-807` |
| **Portable suite** (live only) | copy `out/` to a clean directory, `npm i && npx playwright test` — the suite runs with FORGE uninstalled | `FR-405` |
| Credential grep | zero hits for the password literal in `artifacts/` and the emitted suite | `FR-006`, `I-16` |
| Exit | 1 | `FR-904` |

**The `PRODUCT_BUG` / `ENVIRONMENT` distinction is the subtle assertion.** A 500 from an endpoint that exists and previously worked is the product breaking. An unreachable host is the environment breaking ([04 §7](../02-architecture/04-system-architecture.md)). Getting this backwards would let a real server-side regression be filed as *"someone's laptop"*, which is precisely the failure this project exists to prevent.

---

## 6. Case file format

```jsonc
// fixtures/golden/EC-05.json
{
  "id": "EC-05",
  "title": "One lap heals a broken address and refuses a false claim",
  "seed": 20260905,
  "target": "aperture",

  "given": {
    "reset": true,
    "session": {
      "url": "http://localhost:4100/",
      "credentialsFrom": { "usernameEnv": "T1_USER", "passwordEnv": "T1_PASS" },
      "intent": "focus on checkout",
      "budget": { "maxCapabilities": 1 }
    },
    "mutations": [{ "id": "M-01", "params": { "newId": "btn-a7f3c9" } }, { "id": "M-03" }],
    "fixtures": { "transcripts": "EC-05", "tape": "EC-05" }
  },

  "expect": {
    "session": { "status": "COMPLETED", "exitCode": 1, "defectsFound": 1 },
    "laps": [{
      "capability": "Checkout",
      "outcome": "DEFECT_FOUND",
      "replanRounds": 0,
      "diagnoses": [
        { "stepId": "s4", "kind": "LOCATOR_BREAK", "minConfidence": 0.90,
          "minEvidence": 3, "vetoes": [] },
        { "stepId": "s5", "kind": "PRODUCT_BUG", "vetoes": ["V1", "V3"],
          "final": true, "candidatesEmitted": 0, "defectReport": "required" }
      ],
      "heals": [{
        "stepId": "s4", "strategy": "role_name",
        "locator": "getByRole('button', { name: 'Place order' })",
        "score": 0.891, "tolerance": 1e-6, "minMargin": 0.05,
        "signals": { "semantic": 1.00, "role": 1.00, "text": 1.00,
                     "domContext": 0.95, "visualGeometry": 0.98, "historical": 0.00 },
        "patchApplied": true, "scenarioVersionAfter": 2,
        "verification": { "healedStepRerun": true, "fullFlowRerun": true }
      }]
    }]
  },

  "liveOnly": ["budgets.healDurationMs", "gitDiffNonEmpty"],
  "budgets": { "healDurationMs": 10000, "lapMs": 90000 },
  "requirements": ["FR-601","FR-602","FR-604","FR-701","FR-702","FR-703","FR-704",
                   "FR-705","FR-706","FR-707","FR-709","FR-710"]
}
```

Four properties of this format earn their complexity:

- **`signals` is asserted, not just `score`.** A weight change that lands on 0.891 by coincidence is still a regression in the reasoning, and the table on screen would be wrong.
- **`requirements` is machine-read.** `forge eval --coverage` prints every `MUST` with no asserting case — the traceability rule in [02](../01-foundation/02-requirements.md) enforced rather than promised.
- **`liveOnly` is explicit.** Assertions that cannot be replayed are named in the file, so a green replay run never implies a claim it did not check.
- **`given.reset` is always `true`.** Case independence is a field, not a convention.

---

## 7. Running the harness

```
for each case, in id order:
  1. forge reset                                   # < 20 s, NFR-9
  2. seed RunContext: Clock, Rng, IdGen from case.seed
  3. install the fixture layer for the tier         # RecordedModelClient + ReplayToolset, or neither
  4. POST /__forge/mutations/:id for each mutation  # 409 ⇒ the case is invalid, abort loudly
  5. run the case through the REAL orchestrator, via the REAL API
  6. collect the verdict tuple and the asserted fields
  7. diff against case.expect, skipping `liveOnly` on the replay tier
  8. write artifacts/evals/<runId>/report.json
```

Step 5 is the rule the rest of the harness exists to protect: the eval suite drives the same HTTP surface a human drives ([17](17-api-spec.md)), so what it proves is what ships.

| Command | Purpose |
|---|---|
| `forge eval` | All seven, replay tier. The 7/7 gate in `pnpm verify` |
| `forge eval --tier live` | All seven for real. Phase gates, nightly, pre-freeze |
| `forge eval --case EC-06` | One case — the inner loop while building a veto |
| `forge eval --repeat 5` | The D1 determinism gate (§4.2) |
| `forge eval --coverage` | `MUST` requirements with no asserting case |
| `forge eval --record` | Live run that writes tapes and transcripts for promotion |

```
FORGE EVAL · 7 cases · replay · seed 20260905 · trace @ artifacts/evals/

  EC-01  cold start                 COMPLETED           5 laps   1.9s  ✓
  EC-02  explore, no model          COMPLETED           5 caps   0.8s  ✓
  EC-03  critic sends it back       COMPLETED   replan  0.4519 → 0.8435   1.2s  ✓
  EC-04  both ceilings              ESCALATED   V4      2 rounds · 0.72/0.70   1.4s  ✓
  EC-05  heal + refuse              COMPLETED   healed  0.891 · V1,V3   2.1s  ✓
  EC-06  two refusals               COMPLETED   V1 · V2 @ 0.71   2.4s  ✓
  EC-07  the deliverable            COMPLETED   V5      score 61 → 94   3.0s  ✓

  7/7 · 12.8s · exits 0,0,0,2,1,1,1 · model calls 0 · deterministic-fallback used: n/a
```

The numbers print in the summary line deliberately. A drifting `0.891` or a moved `0.8435` is visible at a glance on every run, without opening a report.

---

## 8. Unit and contract inventory

The golden cases prove the loop. These prove the arithmetic, and they are the tests that run in under a second.

### 8.1 The five vetoes — one dedicated test each, both halves (`FR-704`)

| Test | Fires when | **Does not fire when** |
|---|---|---|
| `V1_assertion_target_blocks_heal` | assertion step + `ASSERTION_FAILED` | the same step fails `LOCATOR_NOT_FOUND` — that is a real address break |
| `V2_destructive_verb_blocks_heal` | non-destructive fingerprint → destructive candidate, **even at 0.71** | the fingerprint was *already* destructive (a *Delete* button that moved) |
| `V3_numeric_only_delta_blocks_heal` | `"Pay ₹999"` vs `"Pay ₹9,999"` | `"Pay ₹999"` vs `"Buy ₹999"` — the change is not numeric |
| `V4_ambiguous_margin_escalates` | margin `0.0499` | margin `0.05` |
| `V5_new_runtime_error_blocks_heal` | a 5xx **new since the baseline** | a 5xx that was already there before the run |

**The negative half of each row matters as much as the positive half.** A veto that fires on everything is not a safety mechanism, it is a broken healer — and it would silently delete the entire heal path from the product while every "does it block?" test stayed green.

### 8.2 The eleven guards

One test per `TG-n` ([04 §3.3](../02-architecture/04-system-architecture.md)), each asserting the transition **and** its refusal:

| Guard | The refusal that is tested |
|---|---|
| `TG-1` | a non-http scheme, and a host outside the allowlist |
| `TG-2` | zero capabilities degrades to one synthetic capability, never `ERROR` |
| `TG-3` | ordering is identical across five calls on one fixture map |
| `TG-4` | a lap whose `dependsOn` is unbanked does not start |
| `TG-5a` | a step citing an unobserved `affordanceRef` fails validation |
| `TG-5b` | a `BLOCKER` blocks even at score 1.0; the floor blocks with zero blockers |
| `TG-6` | `replanRounds` 2 → the third round never happens |
| `TG-7` | a locator resolving to 2 drops the scenario rather than taking the first |
| `TG-8` | a `FLAKY` scenario still reaches a terminal verdict |
| `TG-9` | any of the three conditions absent blocks the heal |
| `TG-10` | `healedStepRerun` true with `fullFlowRerun` false rolls back |
| `TG-11` | budget exhaustion yields `COMPLETED_PARTIAL`, never `ERROR` |

### 8.3 The twenty-one invariants

`I-1` … `I-21`, each with a test at the path named in [05 §5](../02-architecture/05-data-model.md). These are the tests that fail when someone "just quickly" issues an `UPDATE` against `session_events`, widens the write allowlist, mutates a session configuration, or lets a sub-agent import the store.

### 8.4 Boundaries — mandatory, on both sides

| Threshold | Tested at |
|---|---|
| Coverage floor | `0.6999` → REPLAN · `0.70` → PASS |
| Fail gate | `0.6499` → FAIL · `0.65` → ESCALATE |
| Auto-heal gate | `0.8499` → ESCALATE · `0.85` → AUTO_HEAL |
| Ambiguity margin | `0.0499` → `V4` · `0.05` → no `V4` |
| Re-plan cap | round 1 → REPLAN · round 2 → ACCEPT_RISK |
| Heal caps | 2 per step, 3 per lap, then `ESCALATED` |
| Trust ceilings | perfect sub-scores on `geometry` still cap at `0.35` |

### 8.5 The five tests nobody thinks to write

Each asserts a property that **emerges from two independently chosen constants**. Emergent properties break silently when someone tunes one of them, and a named test converts an accident into a guarantee.

| Test | The property |
|---|---|
| `xpath_never_reaches_the_auto_heal_gate` | XPath's ceiling `0.20` sits below the `0.65` fail gate, so a positional path can be *generated* for the report and never *accepted* ([13 §7](../03-algorithms/13-triage-and-healing.md)) |
| `first_heal_can_never_exceed_0.90` | `historical` weighs `0.10` and is `0.00` on a first encounter, so `0.85` clears with room and `> 0.90` is a bug |
| `happy_path_only_plan_is_blocked_above_the_floor` | Perfect A, T, S and D with one class scores `0.85` — over the floor — and is still rejected, because breadth and kind are two levers ([11 §4.1](../03-algorithms/11-coverage-critic.md)) |
| `semantic_half_can_never_mint_a_blocker` | The model's gaps are clamped to `MAJOR`, so `TG-5b` is model-independent ([ADR-017](../decisions/ADR-017-arithmetic-blocks.md)) |
| `denylisted_affordance_is_excluded_but_reported` | It leaves the coverage denominator *and* mints a `MINOR` gap — so safety cannot silently cap every score, and cannot silently hide a flow either ([11 §3.2](../03-algorithms/11-coverage-critic.md)) |

### 8.6 Determinism unit tests

| Test | Asserts |
|---|---|
| `compile_is_byte_identical` | compiling one fixture plan twice produces equal sha256 (`FR-401`) |
| `markdown_renders_byte_identically` | the plan Markdown regenerates from JSON unchanged (`FR-202`) |
| `report_renderings_agree` | JSON, Markdown and HTML carry the same field values (`FR-805`) |
| `no_wall_clock_in_emitted_code` | no timestamp appears in any generated `.spec.ts` ([12 §7](../03-algorithms/12-generator.md)) |
| `no_target_literals_in_packages` | no target's selector, route or hostname appears in `packages/**` ([19 §1.1](19-target-apps.md)) |
| `no_credential_in_any_artifact` | the password literal appears in no evidence row, event payload, session row or emitted file (`I-16`) |

---

## 9. Rehearsals

Rehearsals exercise the humans and the machine, not the code. `R-n` is reserved for rehearsals and never used for risks, which are `RK-nn` ([23](../05-delivery/23-risk-register.md)).

| ID | Rehearsal | Passes when |
|---|---|---|
| **R-1** | **Cold start** — fresh clone on a clean OS account, nothing cached; then the same via `docker compose up` | `doctor` green, `eval --tier live` 7/7, the demo runs, no manual fix |
| **R-2** | **Offline** — `ANTHROPIC_API_KEY` unset, wifi off | 7/7 with `source: "deterministic"` throughout; **verdicts identical to R-1**; the amber chip is visible |
| **R-3** | **Cold target switch** — a URL nobody has run before, profile only, timed | A map, a backlog, ≥ 1 banked lap and a report, with **zero code changes** ([19 §7](19-target-apps.md)) |
| **R-4** | **Full dress** — from the freeze tag, from `forge reset`, timed; then the 2:30 cut, twice | Inside 4:00 and inside 2:30; the refusal beat still lands; no terminal on the projector |

**R-2 and R-3 are the two that decide whether this project is finished.** `R-2` because [07 §5](../02-architecture/07-llm-integration.md) says plainly that a demo which does not survive the key being unset is not done. `R-3` because the brief's whole premise is *any* URL, and a pipeline validated on one application is a fixture with good manners.

Saying *"the fallback engaged and the verdicts are identical"* out loud is a stronger moment than pretending nothing happened.

---

## 10. Grading ourselves against the real rubric

The brief publishes its weights ([00 §4](../01-foundation/00-problem-alignment.md)). We grade against those, not against an invented scorecard, and each row names the artefact that evidences it.

| Weight | Criterion | Evidenced by |
|---|---|---|
| **30%** | Functionality & completeness | `EC-01` end to end; `R-3` on an unseen URL; `EC-07`'s portable suite |
| **20%** | Innovation — coverage gaps, ambiguity, failure classification | `EC-03` (the Critic sends a plan back), `EC-04` (ambiguity escalates), `EC-05`/`EC-06` (six causes, five vetoes) |
| **20%** | Technical implementation | The guard tests (§8.2), the invariants (§8.3), the emergent-property tests (§8.5), D1 determinism |
| **15%** | UX & demo clarity | `R-4`; every verdict inspectable in under five seconds with ≥ 3 cited evidence items (`S-5`) |
| **10%** | Business impact | `EC-07`'s score delta and `hoursSaved` with its assumptions attached |
| **5%** | Presentation | Seventeen ADRs, each an explicit A-vs-B with a flip trigger |

### 10.1 What we will not claim

Written down so nobody improvises a stronger claim under pressure:

- **Not** *"0.85 is the correct threshold."* It is tuned on seven cases. Say *"the mechanism is principled and the thresholds are tuned on our eval set."*
- **Not** *"deterministic output."* Verdicts are deterministic under replay; prose is not, ever (§4.2).
- **Not** *"works on any web app."* Validated on three applications of different shape, one of which we did not build.
- **Not** *"healing is safe."* Healing is **gated**. The vetoes are recall-oriented and will block some legitimate heals — a deliberate asymmetry ([13 §16](../03-algorithms/13-triage-and-healing.md)).
- **Not** *"we found every bug."* We found the ones our scenarios asserted, and the report names what it never reached.

Overclaiming any of these is how a strong demo loses a technical judge.

---

## 11. Specification reconciliations

Writing the assertions before the code surfaced five places where the upstream documents contradict themselves or under-specify. Each is resolved here, and the resolution is what the harness implements.

### 11.1 `V3` is unreachable as the pre-classifier is currently ordered

[13 §3](../03-algorithms/13-triage-and-healing.md) evaluates ten rows top to bottom, **first match wins**. Row 1 catches *assertion step + `ASSERTION_FAILED`* and mints `V1`. Row 2 catches *numeric-only delta* and mints `V3`. But `expected`/`actual` only exist on an assertion failure, so **every input that could reach row 2 has already matched row 1** — and `V3` can never fire. The pre-brief edition asserted both vetoes on the price case, which the current ordering makes impossible.

**Resolution.** `preClassify()` takes the **first** matching row for `kind`, `confidence` and `final`, and collects the veto id of **every** matching row into `vetoes[]`. One line of semantics, and it restores the redundancy that was intended: `V1` is structural (*this step is a claim*), `V3` is semantic (*the delta is money*), and on `EC-05` arm B both fire. Removing either becomes a red test rather than a silent loss of a guardrail. [13 §3](../03-algorithms/13-triage-and-healing.md) has been amended to say so; the row order is unchanged.

### 11.2 The veto-to-case map raised at Checkpoint C3

[13 §10](../03-algorithms/13-triage-and-healing.md) maps `V1`,`V2` → `EC-06`, `V3` → `EC-05`, `V4` → `EC-04`, `V5` → `EC-07`. The pre-brief doc 08 mapped `V1` → `EC-05`.

**Resolution: the new mapping stands, unchanged.** It follows `FR-705`'s acceptance criterion, which names `EC-06` for the assertion case, and §5 above implements it exactly — with `V1` additionally asserted on `EC-05` arm B as the companion to `V3`, per §11.1. `EC-06` proves `V1` **alone** using `M-12`, which is the stronger test.

### 11.3 Portability: `EC-07` or `EC-01`?

`FR-405` and [12 §6](../03-algorithms/12-generator.md) both name `EC-07` for the cold-clone portable-suite test. [00 §4](../00-work-plan.md)'s `Ph4` exit gate names `EC-01`.

**Resolution.** `EC-01` asserts the suite is **emitted and runs** as part of a clean session — which is what a phase gate needs at the end of `Ph4`, when there is no report yet. `EC-07` asserts **portability**: copied to a clean directory, FORGE uninstalled, `npm i && npx playwright test`. Two different claims, two cases, and `Ph4`'s gate is satisfied by the weaker one because the stronger one depends on `Ph6`.

### 11.4 `EC-04` carries two acceptance criteria that describe different mechanisms

`FR-305` says *"`EC-04` exits after exactly 2 rounds"* (the re-plan cap). `FR-708` says *"`EC-04` exits `ESCALATE` after exactly 2 attempts"* (the heal cap). But `V4` is evaluated **before** scoring and fires on attempt 1, so the heal cap is never approached.

**Resolution.** `EC-04` is *the ceilings case* and asserts both, correctly: `replanRounds === 2` with `ACCEPT_RISK`, and `ESCALATED` via `V4` with `attempts ≤ 2`. The per-step and per-lap caps themselves are proven by `I-4`'s unit test and the boundary suite (§8.4). `FR-708`'s acceptance text over-specifies a route; the requirement holds — the caps are enforced and the case escalates — just not by the path the text imagined.

### 11.5 The exit code for a completed run that found a defect (`W-5`)

Still formally open from Checkpoint C2. `FR-904` maps four terminal states to `0/0/2/3` and leaves no code for *"completed, and found a real defect"*, which `S-4` requires to be non-zero.

**The default in force is implemented here**: the exit code derives from the terminal state **and** `Session.defectsFound` ([04 §3.4](../02-architecture/04-system-architecture.md)), so `EC-05`, `EC-06` and `EC-07` assert exit **1**. If the ruling goes the other way, three lines of three case files change and nothing else does — which is the reason the assertion lives in a fixture rather than in code.

---

## 12. What this harness deliberately does not do

| Not doing | Why |
|---|---|
| Snapshot-testing the model's prose | It varies by design. Testing it produces a suite that fails for correct behaviour |
| Mocking the target's DOM | The DOM contract *is* the thing under test. A mocked DOM tests our mock |
| Reimplementing Playwright's locator engine for replay | We record its **answers**, not its behaviour. A hand-written locator engine would be a second implementation to keep in sync, and the first divergence would be invisible |
| Fuzzing locator inputs | Seven cases we understand completely beat a thousand we do not, on an eight-hour clock |
| A multi-browser matrix | Multiplies flake by three and adds no new idea |
| Measuring pass **rate** | A run that correctly reports `PRODUCT_BUG` is a successful run. Pass rate is the wrong objective and optimising it is the anti-feature |
| Asserting numbers against T2 and T3 | Their HTML is not ours to pin. We assert shape there, never scores ([19 §6.2](19-target-apps.md)) |

---

## 13. Related documents

- The contracts each tier exercises → [06 · Agent Contracts](../02-architecture/06-agent-contracts.md)
- The invariants §8.3 enumerates → [05 §5](../02-architecture/05-data-model.md)
- The guards §8.2 enumerates → [04 §3.3](../02-architecture/04-system-architecture.md)
- The scores `EC-03` and `EC-05` assert → [11 §3.4](../03-algorithms/11-coverage-critic.md), [13 §8.7](../03-algorithms/13-triage-and-healing.md)
- The defects the cases toggle → [19 §5](19-target-apps.md)
- The API the harness drives → [17 · API Spec](17-api-spec.md)
- Where each case sits as a phase gate → [20 · Execution Plan](../05-delivery/20-execution-plan.md)
- The rehearsals in stage order → [22 · Demo Runbook](../05-delivery/22-demo-runbook.md)
