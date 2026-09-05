# 14 · Quality Report & Score

> **The artefact everyone actually reads.** The brief's clause `M7` names five things a report must contain; this document maps each to a field, says where it comes from, and then adds the one thing the brief did not ask for and a manager will: a number.
> **This document owns:** the report assembly, the Robustness Score formula, the projected delta, the untested-flow ranking, and the hours-saved estimate with its assumptions.
> **No model runs in this stage.** `buildReport()` is a pure function of stored rows.

---

## 1. The five mandated contents (`FR-801`, `M7`)

| The brief's words              | Field                     | Assembled from                                                                                 |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| _"Test scenarios covered"_     | `scenariosCovered[]`      | Every `Scenario` in every banked lap's final `TestPlan`                                        |
| _"Pass/fail outcomes"_         | `outcomes{}`              | `Run.status` counts across the session — passed, failed, healed, flaky, skipped                |
| _"Self-healing actions taken"_ | `healerActions[]`         | Every `Diagnosis` that reached a decision: `HEALED`, `BLOCKED` (with its veto id), `ESCALATED` |
| _"Coverage gaps remaining"_    | `coverageGapsRemaining[]` | `residualGaps` from every passing assessment, plus `Lap.acceptedRisk`                          |
| _"Untested flow risk"_         | `untestedFlowRisk[]`      | The backlog remainder, already risk-ranked (§4)                                                |

All five are non-optional in the schema, and `I-18` asserts each is populated on `EC-07`. A report that renders four of them is a schema violation, not a formatting choice.

### 1.1 Why it is a pure function of stored rows

```ts
// packages/core/report
buildReport(sessionId: string, store: ReadOnlyStore): QualityReport;   // pure
render(report: QualityReport): { html: string; markdown: string; json: string };   // FR-805
```

Because it reads only what is on disk, the report is **regenerated after every lap** for essentially nothing. Two consequences that matter more than the cost:

- **A report always exists.** Kill the process at 40% and there is a complete, honest report covering 40%.
- **It cannot disagree with the evidence.** There is no accumulator to drift, no in-memory tally to lose on a restart. The three renderings agree field for field because they are three projections of one document (`FR-805`).

---

## 2. Coverage gaps remaining, and the two ways a gap gets there

| Source            | Meaning                                           | Field on the assessment         |
| ----------------- | ------------------------------------------------- | ------------------------------- |
| **Residual gaps** | The plan _passed_ and these still remain          | `residualGaps[]` (`FR-306`)     |
| **Accepted risk** | The re-plan cap was spent and we proceeded anyway | `Lap.acceptedRisk[]` (`FR-305`) |

They are rendered as two sections, not merged. _"We passed and this is still missing"_ and _"we could not fix this in two rounds and shipped anyway"_ are different admissions, and collapsing them into one list loses the second one — which is the more important of the two.

---

## 3. The Robustness Score (`FR-802`)

### 3.1 What it measures, and what it deliberately does not

**It scores the test suite and the evidence behind it — not the application.**

That distinction is the whole design. If open defects lowered the score, then a run that found a real bug would score worse than a run that found nothing, and the tool would be quietly incentivised against its own best outcome. Finding a defect is a _success_; it appears in `defects[]` with its own severity, and it does not move the score.

Five properties the formula is held to:

1. **Published.** The formula is here, in the document, not in a slide.
2. **Deterministic.** Recomputing from stored rows reproduces it exactly (`I-19`).
3. **Bounded** in `[0, 100]`.
4. **Decomposable.** Every term is in `components{}` so it can be re-added by hand.
5. **Not gameable by volume.** More tests do not raise it; broader and more durable tests do.

### 3.2 The five components

| Component       | Points | Formula                                                                                                                                         |
| --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Coverage**    | 30     | `30 × mean(finalAssessment.score over ALL backlog capabilities, unbanked counting 0)`                                                           |
| **Depth**       | 20     | `20 × (capabilities whose final plan carries all four scenario classes) / (all backlog capabilities)`                                           |
| **Determinism** | 15     | `15 × (1 − flakySteps / executedSteps)`                                                                                                         |
| **Resilience**  | 15     | `15 × mean(baseTrust[strategy] over every emitted locator)`                                                                                     |
| **Integrity**   | 20     | `20 − 2·escalations − 1·droppedScenarios − 2·acceptedRiskBlockers − 3·rolledBackHeals`, each term capped at `8 / 6 / 4 / 6`, total floored at 0 |

```
current = Coverage + Depth + Determinism + Resilience + Integrity
```

Four of those five deserve a sentence of justification.

**Coverage averages over the whole backlog, not over what we got to.** A session that explored six capabilities and banked four scores the two it never reached as zero. Averaging over banked laps only would let a run that stopped early score as well as a run that finished — which is precisely the dishonesty `haltReason` exists to prevent, and it would be strange to defend it in one document and permit it in another.

**Resilience reuses `baseTrust[]` from the healing ladder** ([13 §7](13-triage-and-healing.md)). It is the same question — _how likely is this address to survive a refactor?_ — so it is the same constant, not a second table that can drift from the first. A suite of `getByRole` locators scores 15; a suite of CSS selectors scores under 4. **This is the term that makes the durability claim measurable** rather than rhetorical.

**Determinism penalises flakes, and only flakes.** A step that passed on retry is `FLAKY`, never `PASSED` (`FR-509`), so a suite that quietly retries its way to green is scored for what it actually did.

**Integrity counts what makes the suite less trustworthy** — escalations nobody resolved, scenarios we dropped, blockers we shipped as accepted risk, heals we had to roll back. Note what is absent: defects found. See §3.1.

### 3.3 Worked example

A session against the reference shop. Six capabilities in the backlog; the duration budget expired after four laps, so the session ended `COMPLETED_PARTIAL`.

| Input                                                                        | Value                     |
| ---------------------------------------------------------------------------- | ------------------------- |
| Final assessment scores, banked laps                                         | 0.84, 0.79, 0.72, 0.65    |
| Capabilities never reached                                                   | 2 (Cart, Browse & Search) |
| Laps carrying all four scenario classes                                      | 2 of 6                    |
| Steps executed / flaky                                                       | 138 / 2                   |
| Emitted locators / mean `baseTrust`                                          | 38 / 0.884                |
| Escalations · dropped scenarios · accepted-risk blockers · rolled-back heals | 2 · 3 · 1 · 0             |

```
Coverage    30 × (0.84+0.79+0.72+0.65+0+0)/6 = 30 × 0.5000 = 15.00
Depth       20 × 2/6                          = 20 × 0.3333 =  6.67
Determinism 15 × (1 − 2/138)                  = 15 × 0.9855 = 14.78
Resilience  15 × 0.884                                      = 13.26
Integrity   20 − (2×2) − (1×3) − (2×1) − 0                  = 11.00
                                                    current   60.71  ->  61
```

### 3.4 Per-capability contribution (`FR-806`)

Fifty of the hundred points are capability-attributable — Coverage (30) and Depth (20) — so each of the six backlog capabilities can earn up to **8.33**. The other fifty (Determinism, Resilience, Integrity) are session-wide and are reported once. Every point is attributable, so a team knows where the next hour goes.

| Capability      | Coverage pts | Depth pts | Earned    | of 8.33  | Lost because                                                    |
| --------------- | ------------ | --------- | --------- | -------- | --------------------------------------------------------------- |
| Checkout        | 4.20         | 3.33      | **7.53**  | 90%      | 3 residual gaps                                                 |
| Sign-in         | 3.60         | 3.33      | **6.93**  | 83%      | 2 residual gaps                                                 |
| Account         | 3.95         | 0.00      | **3.95**  | 47%      | no `error_state` scenario                                       |
| Admin Catalogue | 3.25         | 0.00      | **3.25**  | 39%      | no `negative` scenario · accepted risk: the coupon-flow blocker |
| Cart            | 0.00         | 0.00      | **0.00**  | **0%**   | **never tested — duration budget expired**                      |
| Browse & Search | 0.00         | 0.00      | **0.00**  | **0%**   | **never tested — duration budget expired**                      |
|                 | **15.00**    | **6.67**  | **21.67** | of 50.00 |                                                                 |

Two rows of zero are worth more than any paragraph we could write about honesty.

### 3.5 The projected delta (`FR-803`)

`projected` is the score recomputed with **every open finding resolved**. Each finding also carries `pointsIfFixed`, measured **in isolation** — the score with that one finding resolved, minus the current score.

| #   | Finding                                                                     | `pointsIfFixed` |
| --- | --------------------------------------------------------------------------- | --------------- |
| F1  | Two capabilities never tested — raise the budget or the worker count        | **+10.83**      |
| F2  | Add the missing `negative` and `error_state` scenarios in Account and Admin | +6.66           |
| F3  | Close the 9 residual coverage gaps across the four banked laps              | +2.20           |
| F4  | Resolve the 2 open escalations                                              | +4.00           |
| F5  | Generate the 3 dropped scenarios (fix their ambiguous locators)             | +3.00           |
| F6  | Close the accepted-risk blocker in Admin Catalogue                          | +2.00           |
|     | **projected, all resolved, computed jointly**                               | **93.84 → 94**  |

> **The deltas do not sum to the projected total, and we say so on the page.** 28.69 of individual deltas against a 33.13 joint improvement — the findings interact, because running the two missing capabilities also lets their coverage and depth count. We publish the **jointly recomputed** projection and label each finding's number as measured in isolation. A report that adds up interacting improvements and presents the total as a forecast is doing arithmetic it knows is wrong.

The headline sentence a manager reads:

> **"Your suite scores 61. Fix these six things and it scores 94 — and the biggest single item is that two capabilities were never reached."**

---

## 4. Untested flow risk, ranked (`FR-804`)

Never alphabetical, never insertion order. This section is the backlog remainder, and it is _already ranked_ — same `RiskFactors`, same weights, same function as [09 §6](09-exploration-and-prioritisation.md). One ranking, computed once, used twice.

| Capability                | risk  | Why it is untested                                                                   |
| ------------------------- | ----- | ------------------------------------------------------------------------------------ |
| **Cart**                  | 0.446 | Duration budget expired after lap 4                                                  |
| **Browse & Search**       | 0.220 | Duration budget expired after lap 4                                                  |
| _Checkout · Cancel order_ | —     | Deny-listed on a non-disposable target; re-run with `--disposable-target` (`FR-209`) |

### 4.1 `haltReason` limits what this section may claim

The Explorer's halt reason travels here and constrains the language, in code:

| `haltReason`                  | The report is permitted to say                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `EXHAUSTED`                   | _"We explored this application fully. These flows are untested."_                                        |
| `STATE_BUDGET`                | _"We explored 40 of an unknown number of states. There may be capabilities we never saw."_               |
| `TIME_BUDGET` / `CALL_BUDGET` | _"Exploration was cut short by a budget. Coverage below is of what we reached, not of the application."_ |

A crawler that stopped early and reported complete coverage of what it happened to see is the specific dishonesty this table prevents. The strings are constants selected by the enum, not prose a model wrote.

---

## 5. Healer actions — where the refusals are the interesting rows (`M7`)

Every decision, not only the successful ones:

| Scenario · step | Decision      | Veto | Before → after                                               | Conf. | Verified     |
| --------------- | ------------- | ---- | ------------------------------------------------------------ | ----- | ------------ |
| SC-001 · s4     | **HEALED**    | —    | `#place-order` → `getByRole('button', {name:'Place order'})` | 0.891 | ✅ full flow |
| SC-014 · s6     | **BLOCKED**   | `V3` | —                                                            | 0.71  | —            |
| SC-022 · s3     | **BLOCKED**   | `V2` | —                                                            | 0.71  | —            |
| SC-031 · s2     | **ESCALATED** | `V4` | —                                                            | 0.78  | —            |

Three of those four rows are the system declining to act. A self-healing report that lists only successful heals is a report that has hidden its safety behaviour — and the safety behaviour is the part worth showing ([ADR-001](../decisions/ADR-001-veto-gated-healing.md)).

---

## 6. Defects (`B2`)

Each `PRODUCT_BUG` diagnosis becomes one entry: the capability, `expected`, `actual`, severity, and a link to the full defect report with its reproduction steps ([13 §14.1](13-triage-and-healing.md)).

Defects do not move the Robustness Score (§3.1), and they **do** determine the process exit code: a completed run that found a real defect exits non-zero, which is what `S-4` requires.

> **Resolved at `W-5` ([00 §7](../00-work-plan.md)).** `FR-904`'s acceptance criterion derives the exit code from the terminal state **and** `Session.defectsFound` ([04 §3.4](../02-architecture/04-system-architecture.md)), giving exit `1` for a completed run with findings. This document assumes that resolution.

---

## 7. Hours saved (`FR-807`)

```
hoursSaved = ( scenariosGenerated × MANUAL_AUTHOR_MIN
             + healedSteps        × MANUAL_REPAIR_MIN
             − pipelineMinutes ) / 60
```

Worked on the same session: `(22 × 25 + 3 × 12 − 11) / 60 = 575 / 60 = **9.6 hours**`.

The assumptions ship **in the same object** as the number (`hoursSaved.assumptions[]`, `min(1)` in the schema — it is structurally impossible to render the figure without them):

1. `MANUAL_AUTHOR_MIN = 25` — median minutes to author, debug and review one end-to-end scenario by hand.
2. `MANUAL_REPAIR_MIN = 12` — median minutes to diagnose and repair one broken locator by hand.
3. Excludes the time a human spends reviewing FORGE's output, which is not zero.
4. Assumes these scenarios would have been written at all. Scenarios nobody would have authored are not hours anybody would have spent.
5. Counts only banked scenarios. Dropped and `plannedNotGenerated` scenarios contribute nothing.

**The field is nullable, and it is null below 5 banked scenarios.** A business-impact number extrapolated from three tests is a marketing claim; the schema refuses to produce one. A number with its assumptions detached is a claim — with them attached it is an estimate, and that is the only thing we are entitled to offer.

---

## 8. Rendering (`FR-805`)

| Form     | Path                                  | For                                                  |
| -------- | ------------------------------------- | ---------------------------------------------------- |
| JSON     | `artifacts/sessions/<id>/report.json` | The dashboard, CI, and anything programmatic         |
| Markdown | `artifacts/sessions/<id>/report.md`   | A pull request comment, a Slack paste, a human       |
| HTML     | `artifacts/sessions/<id>/report.html` | Self-contained, opens with no server, prints cleanly |

All three are pure renderings of one `QualityReport` document, so _"they agree field for field"_ is a property rather than a test we hope passes. Only the HTML carries the score gauge and the per-capability bars; the Markdown states the same numbers in tables, because a report that loses its meaning when the CSS is gone is a dashboard, not a report.

---

## 9. Known limitations

| Limitation                                            | Impact                                                                              | Stated answer                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The weights are reasoned, not fitted                  | 61 is meaningful _relative to another FORGE run_, not against an industry benchmark | Said on the page. The score's job is to be comparable across runs of the same suite and to decompose into actions     |
| Coverage inherits the Critic's denominator            | An under-explored application makes the coverage term optimistic                    | `haltReason` gates the claim (§4.1), and unreached capabilities score zero                                            |
| `pointsIfFixed` assumes a fix is complete and correct | A partially closed gap earns less than advertised                                   | Deltas are labelled _in isolation_, and the projection is recomputed jointly                                          |
| Hours saved rests on two industry medians             | The number moves a lot if a team's medians differ                                   | Both constants are in the assumptions list and are one config change away                                             |
| Depth is binary per capability                        | A capability with three of four classes scores the same as one with one             | Deliberate: the fourth class is where error states live, and partial credit for missing them is how they stay missing |

---

## 10. Related documents

- The coverage score this report averages → [11 §3](11-coverage-critic.md)
- The risk factors this ranking reuses → [09 §6](09-exploration-and-prioritisation.md)
- The `baseTrust` constant the Resilience term reuses → [13 §7](13-triage-and-healing.md)
- Healer decisions and defect reports → [13 §10, §14](13-triage-and-healing.md)
- The report and score shapes → [05 §2.10](../02-architecture/05-data-model.md)
- How it is rendered on screen → [18 · UI Spec](../04-build/18-ui-spec.md)
- The brief clauses it satisfies → [00 §3, §4](../01-foundation/00-problem-alignment.md)
