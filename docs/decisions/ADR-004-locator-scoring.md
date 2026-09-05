# ADR-004 · Locator scoring is deterministic arithmetic, not embeddings or an LLM judge

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P2 (healing owner) · P1 consulted |
| **Requirements** | FR-401, FR-402, FR-403, FR-410, NFR-1, NFR-2, NFR-3 |
| **Governs** | [13 §7–8](../03-algorithms/13-triage-and-healing.md) |
| **Related risks** | [RK-02](../05-delivery/23-risk-register.md), RK-08 |

---

## 1. Context

Given a fingerprint of an element that worked and a live DOM that no longer contains its old address, we must rank replacement candidates. This is a similarity problem, and similarity problems in 2026 have an obvious default answer: embed both sides and compare vectors, or hand the candidates to a model and ask which one matches.

Two constraints make the obvious answer costly. The score has to be **bit-reproducible** (NFR-1) and available **with no network** (NFR-2) — because it is the number a judge will read off the screen and the number the auto-heal gate is compared against. And it has to be **explainable in five seconds on a projector**, which is a harder requirement than accuracy.

---

## 2. The two options

### Option A — Embedding similarity and/or an LLM judge

`semantic` computed by a sentence encoder (local model or API), or the ranking delegated wholesale to a model given the fingerprint and the candidate list.

### Option B — Six weighted signals, pure arithmetic *(chosen)*

```
score_raw = 0.30·semantic + 0.20·role + 0.15·text
          + 0.15·domContext + 0.10·visualGeometry + 0.10·historical

score = min(score_raw, baseTrust[strategy])
```

with `semantic = 0.6·jaccardTokenSet + 0.4·levenshteinRatio` over normalised strings, and a per-strategy **base-trust ceiling** from the ladder (role+name 1.00 … geometry 0.35 … xpath 0.20).

### Comparison

| Criterion | A · embeddings / LLM judge | B · weighted arithmetic |
|---|---|---|
| Synonyms (*Submit* vs *Place order*) | **Clearly better** | Fails — scores ≈0.2 semantic and refuses to heal |
| Bit-reproducible (NFR-1) | Local model: mostly. API: no | Yes, exactly |
| Works offline (NFR-2) | Only with a bundled model | Yes |
| Latency | 50–200 ms local, ~1 s API | Microseconds |
| Explainable on a projector | "The embedding said 0.87" | Six named sub-scores, a ceiling and a margin |
| Unit-testable without fixtures or a model | No | Yes |
| Dependency weight | A model file or an API key on the critical path | None |
| Natural notion of a confidence *ceiling* | None — a vector has no provenance | Yes — `min(raw, baseTrust)` |
| Needs calibration data to be defensible | Yes | Yes (stated openly) |
| Confidently wrong on dangerous renames | Yes — will happily rank *Delete order* as the best match for *Place order* | Also yes — which is why the veto layer, not the scorer, is the safety mechanism |

That last row matters and is easy to misread. **Neither option is safe on its own.** The safety comes from [ADR-001](ADR-001-veto-gated-healing.md). What differs is that an unexplainable ranking can only be vetoed on its *output*, whereas a decomposed score can be vetoed on the *signal that produced it* — and can be read aloud.

---

## 3. Decision

**Option B.** Six signals, weighted sum, per-strategy ceiling, no model involvement anywhere in the scoring path.

The part doing the most work is **not** the weights — it is the ceiling rule. `score = min(score_raw, baseTrust[strategy])` encodes a claim the weights cannot express: *the kind of evidence bounds the confidence, independently of how good the numbers look.* A geometric match at the fingerprint's centre point can score 0.98 on every sub-score and still cannot reach the 0.85 auto-heal gate, because "something is at those coordinates" is not evidence of identity. An embedding score has no natural ceiling; it would have to be bolted on, and it would be arbitrary when it was.

Two further properties fall out of this and are worth naming because they look like bugs until you know they are deliberate:

- **XPath is generated but can never be accepted** (ceiling 0.20 < the 0.65 fail gate). It exists so the report can say *"the only remaining address was a positional XPath, which we do not trust"* — more useful to an engineer than "no candidates found". This is an *emergent* property of two independently chosen constants, so it gets its own named test ([16 §8.5](../04-build/16-agent-test-suite.md)).
- **A first heal is capped at 0.90**, because `historical` is necessarily 0.00 on first encounter. The gate sits at 0.85 precisely so a flawless first match clears it with headroom. A first heal scoring above 0.90 means the scorer has a bug.

The synonym weakness is real and is accepted rather than mitigated: the failure direction is *refuse to heal*, which is the safe direction.

---

## 4. Consequences

**What we accept**

- Copy rewrites (*Place order* → *Complete purchase*) will not heal. They will fail with evidence, which is correct but will look like a miss to someone who does not know why.
- Weights are tuned against seven golden cases. The defensible claim is *"the mechanism is principled and the thresholds are tuned on our eval set"* — never *"0.85 is the universally correct threshold."*
- Every scoring change moves the number on stage (RK-02).

**What it buys**

- Determinism to 1e-6, asserted in EC-02 across all six sub-scores.
- The signals table renders directly in the Self-Heal screen. Judges read the arithmetic instead of trusting it.
- `historical` gives the element an identity that accumulates across refactors (FR-410) — the second heal of the same element is measurably more confident than the first, and that is a story no similarity score alone can tell.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| A weight or normalisation change moves the heal score off 0.891, so the stage number no longer matches the docs | RK-02 · 4 | EC-02 asserts the score and all six sub-scores to 1e-6; the score prints on every eval run. After D-2, **update the spoken number, never the code** |
| `historical` engaging in rehearsal makes the Scenario B score differ from ≈0.71 | RK-08 · 2 | The presenter quotes the screen, never a memorised number. Turn it into the answer: *"second time we've seen this element — and we still refuse"* |
| A `NaN` from an out-of-bounds index silently drops a candidate below the gate | not registered | `noUncheckedIndexedAccess` stays on ([15 §3](../04-build/15-repo-and-conventions.md)). This is the concrete reason it stays on |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | UI labels are short and lexically overlapping across refactors | Copy rewrites become unhealable. Holds well for ID/class renames — the common case — and badly for redesigns | A break where `role` and `domContext` are both 1.00 but `semantic` is under 0.3. **That exact pattern is the synonym gap**, and it is worth alerting on rather than inferring |
| A2 | The six signals are independent enough that a weighted sum means something | They are **not** fully independent — `semantic` and `text` overlap heavily, and `role` is keyed off the same accessible name `semantic` reads. Correlated signals double-count, so a good-text/bad-everything-else candidate can over-score | Candidates clearing the gate with `sem + text ≥ 0.9` but `domContext ≤ 0.3`. The ceiling rule and V4's margin are what currently contain this; neither was designed for it |
| A3 | Weights tuned on seven cases generalise | Assumed **false** in general. We claim only what §3 says | Not falsifiable at our scale. The honest position is to state the sample size before being asked |
| A4 | `min(raw, ceiling)` is the right composition | An alternative is a multiplicative penalty, which would let a superb geometric match creep upward. We chose the hard cap because a cap is a *statement* and a penalty is a *tuning parameter* | If a legitimate heal is ever blocked purely by a ceiling — the ladder rung is wrong, not the rule |
| A5 | Lexical scoring is not gameable by the SUT's own vocabulary | Our page has one *Place order* button. A page with four similar buttons escalates via V4 — correct, but it means real apps escalate more than our demo suggests | Ratio of `ESCALATE` to `AUTO_HEAL` on any app that is not the SUT. We have no such measurement and should not imply we do |
| A6 | The 0.05 ambiguity margin is meaningful at our precision | With correlated signals (A2), two genuinely different elements can land inside 0.05 by coincidence rather than by real ambiguity | V4 escalating on candidates that a human finds obviously distinguishable |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| Synonym failures exceed ~25% of missed heals on a labelled corpus | Add a **bundled, offline** sentence encoder as an *additional* signal. Keep the lexical score as a floor beneath it — never a replacement, or NFR-1 and NFR-2 both break |
| ≥500 labelled breakages become available | Fit the weights (logistic regression), report precision and recall, and **keep the ceilings as hard constraints** — they are not parameters |
| Analysis shows signal correlation (A2) is inflating scores | Orthogonalise before reweighting: merge `text` into `semantic` and reallocate its 0.15, rather than adding a seventh signal |
| Any proposal to have a model produce or adjust the score | It may feed **a signal**, never the verdict. The moment a model output can move a candidate across 0.85, [ADR-001](ADR-001-veto-gated-healing.md) and [ADR-002](ADR-002-llm-role.md) both reopen |
| EC-02 prints a score other than 0.891 before D-2 | Investigate as a regression. After D-2, the docs and the script change — not the code (RK-02) |

---

## 8. Related

- [ADR-001 · Veto-gated healing](ADR-001-veto-gated-healing.md) — the layer that makes an imperfect scorer safe
- [ADR-002 · LLM role](ADR-002-llm-role.md) — why Adjudicate can only lower an outcome
- [13 §7–8](../03-algorithms/13-triage-and-healing.md) — the ladder, the weights and the worked Scenario A table
- [16 §8.4–8.5](../04-build/16-agent-test-suite.md) — boundary tests and the XPath-ceiling test
