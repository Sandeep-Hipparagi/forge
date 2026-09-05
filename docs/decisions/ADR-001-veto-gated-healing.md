# ADR-001 · Healing is veto-gated, not confidence-gated

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P2 (healing owner), P4 (veto owner), P1 · P5 consulted |
| **Requirements** | FR-403, FR-404, FR-405, FR-301 |
| **Governs** | [13 §9–10](../03-algorithms/13-triage-and-healing.md) · [01 §5.3](../01-foundation/01-vision-and-scope.md) |
| **Related risks** | [RK-09](../05-delivery/23-risk-register.md) |

---

## 1. Context

Self-healing test automation is commercially proven — mabl, Testim, Tricentis and Functionize all ship it, and customers pay for it. Every one of those healers is built as a **recovery** mechanism: the locator stopped resolving, so find the most similar element and continue.

The problem is that the two situations we care about are *indistinguishable at the point of failure*:

| | Test broke | Product broke |
|---|---|---|
| Symptom | `0 elements matched` | `0 elements matched` |
| Correct action | Repair the address | Stop and report |

A recovery-oriented healer answers both cases the same way, which means that on the second row it converts a loud product regression into a silent green build. That is not a rough edge; it is an anti-feature, and it is the specific thing this project exists to not do ([01 §2](../01-foundation/01-vision-and-scope.md)).

So the design question is not *"how good is our similarity score?"* It is: **what mechanism decides whether healing is legitimate at all?**

---

## 2. The two options

### Option A — Confidence-threshold healing

One scalar per candidate. Heal above the threshold, fail below it. Safety is purchased by raising the threshold.

```
score = f(signals)
if (score >= T) heal else fail
```

### Option B — Veto-gated healing *(chosen)*

Two stages, evaluated in a fixed order. Deterministic **vetoes** run *first* and can return `HEAL_BLOCKED` carrying a verdict of their own; the confidence gates run only on what survives.

```
if (anyVetoFired)                            → HEAL_BLOCKED (veto's own verdict)
else if (score >= 0.85 && margin > 0.05)     → AUTO_HEAL
else if (score >= 0.65)                      → ESCALATE_FOR_REVIEW
else                                         → FAIL_WITH_EVIDENCE
```

A veto is not "a very low score". It is a categorically different statement: *this class of change must not be auto-repaired regardless of how confident the arithmetic is.*

### Comparison

| Criterion | A · threshold | B · vetoes first |
|---|---|---|
| Catches *Place order* → *Delete order* | No — scores ≈0.71, high on every signal | Yes — V2 fires, the score is never consulted |
| Catches `₹999` → `₹9,999` | No — edit distance 1, scores ≈0.99 | Yes — V3 fires |
| Safety knob | One threshold, coupled to recall | Per-class rules, decoupled from recall |
| Cost of buying more safety | Also blocks legitimate heals | Blocks only the named class |
| Explainable on stage | "0.91 ≥ 0.85" | "0.71 said heal; V2 said no; **the veto wins**" |
| Needs a labelled corpus to be defensible | Yes — a threshold is a claim about a distribution | No — a veto is a claim about a *category* |
| Implementation cost | ~0 (the scorer already exists) | 5 rules + 10 tests, ≈0.5 day |
| New failure mode introduced | Silent false heals | False blocks (a human minute) |

---

## 3. Decision

**Option B.** Five hard vetoes (V1 assertion-target, V2 destructive verb, V3 numeric/currency drift, V4 ambiguity, V5 runtime regression), evaluated before any score meets any gate, each carrying its own verdict, each with a dedicated unit test *and* a dedicated negative test.

The reasoning that settles it is the **cost asymmetry**, and it is worth stating as arithmetic rather than as a principle:

- A false block costs one engineer roughly one minute of triage against a complete evidence pack.
- A false heal costs a production incident *plus* the credibility of every green result the suite has ever produced. Once a suite is known to heal through real bugs, its passes stop carrying information.

Option A forces a single exchange rate between those two costs — the threshold **is** that exchange rate. But the costs are not merely unequal in magnitude, they are unequal **by category**: some changes are dangerous because of what they mean, not because of how uncertain we are about them. A scalar cannot express *"no price is high enough here."* A veto can.

The secondary reason is calibration honesty. We have seven golden cases, not a labelled corpus. A threshold tuned on seven cases is a number we cannot defend to a technical judge. A rule that says *"a non-destructive label must never be healed into a destructive one"* needs no corpus to be correct — it is a statement about semantics, and it stays true at n=7 and at n=500,000.

---

## 4. Consequences

**What we accept**

- Some safe heals are refused. This is the correct direction of error and we volunteer it unprompted ([13 §16](../03-algorithms/13-triage-and-healing.md)).
- Five rules is five things to maintain, plus a lexicon (V2) that is English-only.
- Every veto needs a negative test as well as a positive one, or V2 will eventually eat Scenario A (RK-09).

**What it buys**

- FR-405 becomes structural rather than aspirational: assertion failures cannot reach the healer at all.
- The demo's strongest line is a code path, not a slide: `V2 blocked a candidate scoring 0.71`.
- The model can never unblock a veto (FR-304), so model availability does not affect safety — see [ADR-002](ADR-002-llm-role.md).
- `Diagnosis.final = true` becomes an invariant (I-6) instead of a convention.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| A veto is too broad and blocks EC-02's legitimate heal — Scenario A dies on stage | RK-09 · 3 | Every veto has a "does not fire" test; EC-02 asserts `vetoes: []`. Contingency is to **narrow the condition, never disable the veto** |
| The five classes are incomplete — a dangerous change nobody imagined gets healed | not registered | Accepted and stated. The gates are the second line; V4 (ambiguity) catches a useful slice of the unknown |
| V2's lexicon misses a euphemism (*Manage subscription* that in fact cancels) | not registered | Accepted. Named in [13 §16](../03-algorithms/13-triage-and-healing.md) as an i18n / intent-classifier gap |

---

## 6. Hidden assumptions

Each row is something we are betting on without proof. The third column is what we would actually notice first.

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | The five veto classes cover the semantically dangerous changes that occur in practice | A dangerous change is healed and the build goes green — the exact failure this project exists to prevent | A patch a human later reverts. **We do not currently log that signal.** A `patch.reverted` event is the cheapest possible early warning and is the first thing to add after D0 |
| A2 | Danger is detectable from surface text (the accessible name) | Icon-only buttons, localised UIs and euphemistic labels pass V2 untouched | An EC-06 variant with an icon-only destructive button — worth building as an eval case, not merely noting |
| A3 | The cost asymmetry (false heal ≫ false block) holds in the *user's* context, not just ours | In a very large suite, blocks pile into a queue nobody reads, get rubber-stamped, and the veto degrades into a formality that costs latency and buys nothing | Median age of the escalation queue. The fix would then be escalation UX, not fewer vetoes |
| A4 | A fired veto is legible enough that an engineer trusts it | Engineers disable it — and a disabled veto is worse than no veto, because the mechanism is still advertised | Any request for a bypass flag. There is deliberately no `--force-heal` |
| A5 | Vetoes stay cheap and deterministic — they read only evidence already captured | A veto needing a model call inherits model availability, and FR-304's "no model output overrides a veto" becomes circular | Any proposed veto whose input is not already in the evidence bundle. That proposal reopens this ADR **and** [ADR-002](ADR-002-llm-role.md) together |
| A6 | Ordering vetoes before scoring loses no information | It does lose some — we never learn what the scorer *would* have concluded about a vetoed candidate | Deliberate: candidates are still scored and stored, so the report can say "0.71, blocked by V2". Keep it that way; the number is the demo |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| A labelled corpus (≥500 real breakages) shows a single calibrated threshold achieves an equal-or-lower false-heal rate at a **lower** false-block rate | Option A wins on evidence — adopt it. **V1 and V3 survive regardless**, as invariants rather than vetoes: assertions and prices are not a tuning question |
| Measured false-block rate > 15% while false-heal rate is 0 | Vetoes are over-broad. Narrow the offending conditions; consider a learned risk model **with the vetoes as a floor beneath it** |
| A proposed veto requires a model call, live page access, or any non-deterministic input | Reopen this ADR jointly with [ADR-002](ADR-002-llm-role.md). Do not merge it as "just another veto" |
| Escalation queue median age exceeds one working day in real use | A3 has failed. Invest in the escalation experience; do not relax the gates |
| A heal passes full-flow verification and is later reverted by a human | Add the post-heal fingerprint-similarity gate described in [ADR-010 §6](ADR-010-post-heal-verification.md) A3 |

---

## 8. Related

- [ADR-002 · LLM role](ADR-002-llm-role.md) — why the model cannot overrule a veto
- [ADR-004 · Locator scoring](ADR-004-locator-scoring.md) — what the score a veto overrides is made of
- [ADR-010 · Post-heal verification](ADR-010-post-heal-verification.md) — the check *after* the gates
- [13 §9–10](../03-algorithms/13-triage-and-healing.md) — the implementation
- [16 §8.1](../04-build/16-agent-test-suite.md) — one positive and one negative test per veto
