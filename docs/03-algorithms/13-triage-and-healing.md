# 13 · Triage & Healing

> **If a judge digs into one implementation document, it is this one.** It answers the question the brief calls out as a Bonus and most self-healing tools answer wrongly: *did the test break, or did the product?*
> **Revision of the pre-brief `08-healing-engine`,** which the real brief validated rather than invalidated. What changed: the pre-classifier is now specified, `DESIGN_DRIFT` became `CONTENT_DRIFT`, `TestSpec` became `Scenario`, rollback and post-heal verification are `TG-10`, and the whole thing runs inside a capability lap.
> **This document owns:** the six causes, the pre-classifier table, the healing ladder and its base trusts, the six signals, the vetoes `V1`…`V5`, the decision gates, the patch and rollback protocol, and the defect report.
> **Everything that reaches a verdict here is pure, deterministic, unit-testable code. No model call is required.**

---

## 1. The governing distinction

| | Locator | Assertion |
|---|---|---|
| What it is | An **address** for an element | A **truth claim** about the product |
| Example | `getByRole('button', { name: 'Place order' })` | `expect(heading).toHaveText('Order confirmed')` |
| If it breaks | The address is stale → the address may be rewritten | The claim is false → **the product is wrong** |
| Healable | Yes, under evidence | **Never** |

Everything below is machinery for keeping those two apart under pressure. The tool contract makes the distinction mechanical rather than interpretive: `LOCATOR_NOT_FOUND` means *we could not find the thing*; `ASSERTION_FAILED` means *we found it and it was wrong* ([06 §1](../02-architecture/06-agent-contracts.md)).

---

## 2. Six causes, and how each is reached (`FR-601`)

| Kind | Means | Healable | Terminal outcome |
|---|---|---|---|
| `LOCATOR_BREAK` | The element still exists with the same purpose; the old address no longer resolves | **Yes** | `VERIFIED` after `TG-10`, or `ESCALATED` |
| `CONTENT_DRIFT` | Copy changed without behaviour changing — a reworded label on a control we still found | No | `FAIL_WITH_EVIDENCE`, reported |
| `PRODUCT_BUG` | The application's behaviour or content contradicts the expected behaviour | **Never** | `DEFECT_FOUND` + defect report |
| `FLAKY` | Non-deterministic timing or a race | No | `FLAKY` — quarantined, never laundered into a pass (`FR-509`) |
| `ENVIRONMENT` | Server down, 5xx, seed missing, auth expired | No | `FAIL_WITH_EVIDENCE`, not the product's fault |
| `UNKNOWN` | The evidence does not support a verdict | No | `ESCALATED`, always |

`UNKNOWN` is a first-class outcome, not a failure of the classifier. *"We don't know"* with three cited pieces of evidence is a better artefact than a confident guess.

---

## 3. The deterministic pre-classifier (`FR-604`)

```ts
// packages/core/diagnose — pure. Runs BEFORE any model call.
export function preClassify(bundle: EvidenceBundle): Diagnosis;
```

Evaluated top to bottom. The **first** match sets `kind`, `confidence` and `final`; **every** matching row contributes its veto id to `vetoes[]`.

| # | Condition | Kind | Conf. | Veto | `final` |
|---|---|---|---|---|---|
| 1 | `step.kind ∈ ASSERTION_KINDS` **and** code is `ASSERTION_FAILED` | `PRODUCT_BUG` | 0.95 | **V1** | ✅ |
| 2 | `expected` and `actual` differ **only** in numeric or currency tokens | `PRODUCT_BUG` | 0.95 | **V3** | ✅ |
| 3 | A new uncaught console error, or a new 5xx on a request path used by this flow, since the baseline | `PRODUCT_BUG` | 0.90 | **V5** | ✅ |
| 4 | code is `TARGET_UNREACHABLE`, or ≥ 50% of the suite's steps failed with `NAVIGATION_FAILED` | `ENVIRONMENT` | 0.90 | — | ✅ |
| 5 | code is `TIMEOUT` **and** the single retry passed | `FLAKY` | 0.85 | — | ✅ |
| 6 | code is `LOCATOR_NOT_FOUND` **and** an element with the same role and accessible name exists elsewhere in the snapshot | `LOCATOR_BREAK` | 0.80 | — | ❌ |
| 7 | code is `LOCATOR_AMBIGUOUS` | `LOCATOR_BREAK` | 0.60 | — | ❌ |
| 8 | code is `LOCATOR_NOT_FOUND`, no such element, **and** the normalised DOM hash is unchanged since the baseline | `FLAKY` | 0.55 | — | ❌ |
| 9 | The element resolved and its accessible name changed non-numerically | `CONTENT_DRIFT` | 0.70 | — | ❌ |
| 10 | Anything else | `UNKNOWN` | 0.40 | — | ❌ |

Rows 1–5 are `final: true` (`I-6`): the model is **not called at all**, and no model output can move them. Rows 6–10 are hypotheses the model may refine.

> Row 8 is the row people get wrong. A locator that stops resolving while the DOM is byte-identical did not break — we looked too early. Classifying that as a `LOCATOR_BREAK` and healing it produces a rewritten locator for an element that was never lost, and the next run heals it back.

---

## 4. The failure signature and the repeat cache

```
failureSignature = sha256([ errorCode,
                            normalise(message),      // strip ids, digits, URLs, quotes
                            step.targetIntent,
                            domDeltaHash ].join("|")).slice(0, 16)
```

The first occurrence of a signature costs one model call. Every later occurrence anywhere in the session costs **nothing**: the stored `Diagnosis` is reused, `sameRootCauseAs` is set, and the report says *"same root cause as SC-014"* rather than presenting the same finding six times.

This is the concrete mitigation for ADR-012's cross-capability blindness: laps cannot see each other, but the diagnosis cache is session-scoped and indexed (`idx_diag_sig`), so a root cause discovered on lap 2 is recognised on lap 9.

---

## 5. What Triage is shown, and what it may do (`FR-603`)

The evidence bundle, serialised. **There is no tool available to Triage that can fetch a page** ([06 §3](../02-architecture/06-agent-contracts.md)) — which is what makes a diagnosis reproducible from stored evidence, and what makes replaying one in the eval harness meaningful.

| In the bundle | Why |
|---|---|
| The `ToolError` code and message | The code is what the classifier switched on |
| The failing step: kind, `targetIntent`, locator, `expected`/`actual` | The claim that was being made |
| The `ElementFingerprint` from generation time | What the element looked like while it worked |
| The DOM delta summary against the baseline | What changed |
| Console and network deltas against the baseline | Whether the application is on fire behind the button |
| The raw candidates, **unscored** | So the model can reason about identity without being anchored on our arithmetic |
| **The pre-classification** | It is asked to agree, refine, or dissent — with a reason |

Dissent is logged as a signal and shown in the decision inspector. It cannot promote an outcome past a veto (`FR-604`), and `Diagnosis.evidenceIds` must resolve to at least three stored rows or the diagnosis is rejected (`FR-602`, `I-8`).

**Fallback:** the pre-classification stands, `source: "deterministic"`. With the key unset, all seven golden cases still reach their expected verdicts (`FR-605`).

---

## 6. The element fingerprint

Captured on every **successful** interaction — at generation time first ([12 §5](12-generator.md)), then on every green run — so the record we heal against is a record of the element while it still worked.

```jsonc
{
  "id": "fp_01j9x3ac",
  "scenarioId": "SC-001", "stepId": "s4",
  "capturedInRunId": "run_01j9x3aa",

  "intent": "submit the order",
  "role": "button",
  "accessibleName": "Place order",
  "text": "Place order",
  "tagName": "button",
  "testId": null,
  "attributes": { "type": "submit", "aria-label": "Place order" },
  "ancestorPath": [
    { "tag": "main", "role": "main", "id": "checkout-main" },
    { "tag": "form", "role": "form", "id": "checkout-form" },
    { "tag": "div",  "role": null,   "id": "order-actions" }
  ],
  "siblingIndex": 1,
  "bbox": { "x": 1080, "y": 728, "w": 220, "h": 48 },
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 1 },
  "screenshotCropEvidenceId": "ev_01j9x3ab",
  "computedStyle": {
    "color": "#ffffff", "backgroundColor": "#4f39d6",
    "fontSize": "16px", "fontWeight": "600",
    "display": "inline-flex", "visibility": "visible"
  }
}
```

**Why this set of fields:** each survives a *different* kind of refactor. An id rename kills `attributes` but not `role` + `accessibleName`. A CSS framework migration kills `computedStyle` but not `ancestorPath`. A copy edit kills `text` but not `bbox`. A layout change kills `bbox` but not `role`. Redundancy across independent failure modes is the entire point — no single signal is trusted alone, and the weights in §8 reflect how often each survives.

---

## 7. Candidate generation — the healing ladder (`FR-701`)

Strategies are tried in order; each yields at most one candidate; all are collected and then filtered to `resolvedCount === 1` **before** scoring (`I-5`).

| # | Strategy | Built from | Playwright form | Base trust |
|---|---|---|---|---|
| 1 | `role_name` | `role` + `accessibleName` | `getByRole('button', { name: 'Place order' })` | 1.00 |
| 2 | `test_id` | `testId` | `getByTestId('login-submit')` | 0.95 |
| 3 | `label` | associated `<label>` | `getByLabel('Coupon code')` | 0.90 |
| 4 | `placeholder` | `placeholder` | `getByPlaceholder('Enter coupon')` | 0.85 |
| 5 | `text` | visible text | `getByText('Place order', { exact: true })` | 0.80 |
| 6 | `alt_title` | `alt` / `title` | `getByAltText('Cart')` | 0.75 |
| 7 | `dom_relative` | nearest stable ancestor + role | `locator('#order-actions').getByRole('button')` | 0.65 |
| 8 | `css` | tag + stable class | `locator('button.primary')` | 0.45 |
| 9 | `geometry` | element at the fingerprint's centre | from `elementFromPoint` | 0.35 |
| 10 | `xpath` | absolute path | `locator('xpath=/html/body/...')` | 0.20 |

Rules that keep this honest:

- **Base trust is a ceiling, not a bonus.** `score = min(weightedSum, baseTrust)`. A geometric match can never reach the auto-heal gate no matter how well the sub-scores line up — *"something is at those coordinates"* is not evidence of identity.
- **XPath is generated and effectively never accepted** (ceiling 0.20, below the 0.65 fail gate). It exists so the *report* can say *"the only remaining address was a positional XPath, which we do not trust"* — more useful to an engineer than *"no candidates"*.
- Candidates resolving to 0 or 2+ elements are dropped before scoring (`I-5`).
- At most 5 survive, ranked by score, no duplicate locator strings (`FR-701`).

The ordering here differs from the *generation* ladder in [12 §3.2](12-generator.md), on purpose, and that section explains why.

---

## 8. Scoring (`FR-702`)

```
score_raw = 0.30 · semantic
          + 0.20 · role
          + 0.15 · text
          + 0.15 · domContext
          + 0.10 · visualGeometry
          + 0.10 · historical

score = min(score_raw, baseTrust[strategy])
```

Every sub-score is in `[0,1]`, computed by a pure function, and **all six are persisted** on the candidate — so the table below can be rendered from stored rows and re-added by hand.

### 8.1 `semantic` (0.30) — the anchor

A blend of two cheap, dependency-free string measures between `fingerprint.accessibleName ?? intent` and the candidate's observed accessible name:

```ts
semantic = 0.6 * jaccardTokenSet(normalize(a), normalize(b))
         + 0.4 * levenshteinRatio(normalize(a), normalize(b));

// normalize: lowercase, strip punctuation, collapse whitespace,
//            strip a small stopword set ("the", "a", "an", "to", "your")
```

No embeddings. Deliberate: embeddings put a model dependency on the one path that must work offline (`NFR-2`), and for short UI labels token overlap plus edit distance is comparably discriminative. **This is a hackathon trade-off we would revisit in production** — see §14.

### 8.2 `role` (0.20)

```
exact role match                         -> 1.00
compatible pair (see below)              -> 0.50
tag-family match only (button <-> input) -> 0.30
otherwise                                -> 0.00
```

Compatible pairs: `button↔link` (a styled anchor), `textbox↔searchbox`, `combobox↔listbox`, `checkbox↔switch`. Anything else is not a rename; it is a different control.

### 8.3 `text` (0.15)

`levenshteinRatio` on normalised visible text. `1.0` when both are empty — icon buttons legitimately have no text.

### 8.4 `domContext` (0.15)

```ts
domContext = 0.7 * ancestorSimilarity + 0.3 * siblingProximity;

// ancestorSimilarity: longest common SUFFIX of the (tag, role) chain,
//                     over max(depth_a, depth_b)
// siblingProximity:   1 / (1 + |idx_a - idx_b|)
```

Longest common *suffix* rather than prefix, because refactors typically add or remove wrapper `<div>`s near the root while immediate parentage stays intact.

### 8.5 `visualGeometry` (0.10)

```ts
visualGeometry = 0.6 * iou(bboxA, bboxB) + 0.4 * exp(-centerDistance / 200);
```

Both boxes are normalised to the fingerprint's viewport first, so a viewport change cannot masquerade as element movement.

### 8.6 `historical` (0.10)

The maximum `semantic` similarity against the last 10 fingerprints for this `(scenarioId, stepId)`. Zero on a first encounter. This is why the second heal of the same element is more confident than the first (`FR-711`) — the element accumulates an identity across refactors.

### 8.7 Worked example — a benign break (`EC-05`)

Original: `locator('#place-order')` → 0 elements. Fingerprint as in §6. The live DOM now has `<button id="btn-a7f3c9" type="submit">Place order</button>` in the same form.

| Candidate | sem | role | text | dom | geo | hist | raw | trust | **final** |
|---|---|---|---|---|---|---|---|---|---|
| `getByRole('button',{name:'Place order'})` | 1.00 | 1.00 | 1.00 | 0.95 | 0.98 | 0.00 | 0.891 | 1.00 | **0.891** |
| `getByText('Place order')` | 1.00 | 1.00 | 1.00 | 0.95 | 0.98 | 0.00 | 0.891 | 0.80 | **0.800** |
| `locator('#order-actions').getByRole('button')` | 0.55 | 1.00 | 0.40 | 1.00 | 0.98 | 0.00 | 0.673 | 0.65 | **0.650** |
| `locator('xpath=/html/body/main/form/div/div[3]/button')` | 0.00 | 0.00 | 0.00 | 1.00 | 0.98 | 0.00 | 0.248 | 0.20 | **0.200** |

Top 0.891 ≥ 0.85, margin over the runner-up 0.091 > 0.05, no veto fires → **AUTO-HEAL**.

**Why 0.891 and not higher.** `historical` is necessarily 0.00 on a first encounter — there is no prior fingerprint — so it contributes nothing to its 0.10 weight. That caps any *first* heal at **0.90**, even for a flawless role-and-name match. The auto-heal gate sits at 0.85 precisely so a perfect first-time match still clears it with room to spare; on the second heal of the same element `historical` engages and the same match scores ~0.99. **If you ever see a first heal above 0.90, the scorer has a bug.**

This table renders directly in the decision inspector. Judges can read the arithmetic.

---

## 9. Decision gates (`FR-703`)

```
if (anyVetoFired)                              -> per the veto's own verdict   <- checked FIRST
else if (top.score >= 0.85 && margin > 0.05)   -> AUTO_HEAL
else if (top.score >= 0.65)                    -> ESCALATE_FOR_REVIEW   (adjudicate, call site 5)
else                                           -> FAIL_WITH_EVIDENCE
```

Vetoes are evaluated **before** scores. A veto is not a very low score; it is a different kind of statement — *"this class of change must not be auto-repaired regardless of how confident the arithmetic is."*

`adjudicate()` runs only in the `[0.65, 0.85)` band or when the top two are within 0.05, and **it can only lower the outcome** ([07 §3.5](../02-architecture/07-llm-integration.md)). Ceilings are set by arithmetic; the model is permitted to be more cautious than the arithmetic, never less.

**Calibration honesty:** these weights and thresholds are tuned against our seven golden cases, not fitted to a labelled corpus. Say so. The defensible claim is *"the mechanism is principled and the thresholds are tuned on our eval set"* — not *"0.85 is the universally correct threshold."* Overclaiming here is how a strong demo loses a technical judge.

---

## 10. The five vetoes (`FR-704`)

Hard blocks. No confidence score overrides them. Each has a dedicated unit test.

### V1 — Assertion-target veto

**Rule:** if the failing step's `kind ∈ ASSERTION_KINDS` **and** the code is `ASSERTION_FAILED`, healing is forbidden; the diagnosis is `PRODUCT_BUG` with `final: true`.
**Rationale:** the locator worked. We found the element and the claim about it was false. That is the definition of a product bug (`FR-705`).

### V2 — Destructive-verb veto

**Rule:** if the fingerprint's accessible name is non-destructive and a candidate's is destructive, block.

```ts
const DESTRUCTIVE_HEAL = /\b(delete|remove|cancel|void|refund|discard|revoke|
                             terminate|destroy|clear|reset|unsubscribe|close account)\b/i;
```

**Rationale:** *Place order* → *Delete order* is a rename with catastrophic semantics. A pure similarity score rates it highly — same role, same position, same parent, 60% string overlap. This veto is the single most quotable line in the demo:

> "Our similarity score said 0.71. Our veto said no. **The veto wins.**"

> **This is not the same list as the exploration deny-list** in [08 §4.1](../02-architecture/08-perception-layer.md). That one is deliberately broader — it includes `pay`, `transfer` and `place order`, which are perfectly legitimate things for a *generated test* to do on a target the user opted into, but never acceptable for a crawler to press uninvited. Two lists, two questions, two unit-tested constants in two packages. Conflating them would make exploration reckless or healing uselessly timid.

### V3 — Numeric / currency drift veto

**Rule:** if `expected` and `actual` differ **only** in numeric or currency tokens, block and classify `PRODUCT_BUG`.

```
expected "Pay ₹999"   actual "Pay ₹9,999"   -> non-numeric parts identical -> VETO
```

**Rationale:** a pricing bug is the highest-severity thing a checkout flow can get wrong, and it is exactly the shape a naive text-similarity healer waves through — edit distance 1. The same principle forbids `contains` matching on money at generation time ([12 §4.1](12-generator.md)).

### V4 — Ambiguity veto

**Rule:** if the top two eligible candidates are within 0.05, block and escalate.
**Rationale:** when two elements are equally plausible, picking one is a coin flip performed with a confident face. Escalating is the correct engineering behaviour and, on stage, the more impressive one.

### V5 — Runtime regression veto

**Rule:** if, since the baseline run, there is a new uncaught console error, a new 5xx, or a new failed request on a path involved in this flow, block and classify `PRODUCT_BUG`.
**Rationale:** the button may be findable, but the application is on fire behind it. Healing here produces a green test on a broken app — the exact failure mode this project exists to prevent.

### Summary

| ID | Trigger | Verdict | Golden case |
|---|---|---|---|
| `V1` | assertion step + `ASSERTION_FAILED` | `PRODUCT_BUG`, final | `EC-06` |
| `V2` | a destructive verb appears in a candidate | `PRODUCT_BUG`, final | `EC-06` |
| `V3` | numeric-only delta | `PRODUCT_BUG`, final | `EC-05` |
| `V4` | top-2 margin < 0.05 | `ESCALATE` | `EC-04` |
| `V5` | new console error or 5xx since baseline | `PRODUCT_BUG`, final | `EC-07` |

---

## 11. The bounded loop, inside a lap

```ts
// packages/orchestrator/src/heal.ts — the shape, not the implementation
async function triageAndHeal(failure: StepFailure, lap: LapContext): Promise<LapStepOutcome> {
  const MAX_PER_STEP = 2, MAX_PER_LAP = 3;                          // FR-708 · I-4

  const bundle = await collectEvidence(failure, lap);               // FR-502
  const pre    = preClassify(bundle);                               // §3 · deterministic
  const cached = await lap.store.findDiagnosis(pre.failureSignature);
  const diag   = cached ? reuse(cached)                             // §4 · no model call
               : pre.final ? pre                                    // vetoed · no model call
               : await triageAgent(bundle, pre, lap);               // call site 4

  if (diag.kind !== "LOCATOR_BREAK") return bank(diag);             // defect / env / flaky / unknown
  if (attempts(lap, failure.stepId) >= MAX_PER_STEP) return escalate(diag, "PER_STEP_CAP");
  if (lapAttempts(lap) >= MAX_PER_LAP)                return escalate(diag, "PER_LAP_CAP");

  const raw   = await generateCandidates(failure.step.targetIntent, bundle.fingerprint, lap.page);
  const cands = scoreCandidates(bundle.fingerprint, raw, bundle.history);   // pure
  const veto  = applyVetoes({ step: failure.step, bundle, candidates: cands });  // pure, FIRST
  if (veto.blocked) return bank(veto.diagnosis, veto.id);           // V1/V2/V3/V5 -> defect
                                                                    // V4          -> escalate
  const decision = decide(cands);                                   // §9
  if (decision.kind === "FAIL")     return bank(diag);
  if (decision.kind === "ESCALATE") return escalate(diag, "AMBIGUOUS", cands);

  const patch = await applyPatch(lap, failure, decision.candidate);  // §12
  const ok    = await verify(failure.scenarioId, lap);               // §13 · TG-10
  if (!ok) { await rollback(patch.id, lap); return escalate(diag, "VERIFICATION_FAILED"); }
  return banked("VERIFIED", patch);
}
```

Three properties of that function are the whole argument:

1. **The only exit to `VERIFIED` passes through `verify()`.** A healed step passing in isolation is not sufficient.
2. **`applyVetoes` runs before `decide`.** Not after, not alongside.
3. **Every branch ends in a banked outcome.** There is no path where a failure disappears (`I-15`).

---

## 12. Patching and rollback (`FR-706`, `FR-709`, `FR-710`)

The **plan** is patched; the **code** is regenerated ([ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md)).

```
1. record beforeFileSha256 of the current spec file            <- the rollback anchor
2. update Scenario.steps[i].locator; bump Scenario.version     (I-10)
3. recompile the capability's spec file from the patched plan  (deterministic, 12 §7)
4. produce a unified diff between old and new file content     (FR-709)
5. persist TestPatch; attach the diff as PATCH evidence
6. write through store.safeWrite()                             (allowlisted, I-9)
```

The provenance header gains one block. It carries **no wall-clock time** — that would break byte-identical recompilation ([12 §7](12-generator.md)); the timestamp lives on the `TestPatch` row:

```ts
// GENERATED BY FORGE — do not edit by hand. Machine-owned path (FR-407).
// capability: cap_01j9x2m4 "Checkout"
// scenario:   SC-001 · version 2
// healed:     s4 · patch pat_01j9x3b7 · run run_01j9x3aa
//   -  locator('#place-order')
//   +  getByRole('button', { name: 'Place order' })
//   confidence 0.891 · sem 1.00 role 1.00 text 1.00 dom 0.95 geo 0.98 hist 0.00
```

Showing `git diff` on this file live is the strongest possible proof that the fix landed in the repository and not merely in a dashboard.

**Repository authority is explicit.** The MVP runs in `workspace` mode: it writes only the machine-owned generated path. A future `pull_request` mode may create a dedicated patch branch or pull request only after an explicit human authorization is persisted as evidence; it never commits to a shared branch. The same plan patch, generated diff, vetoes and full-flow verification apply in both modes.

**Rollback** restores the file byte-for-byte from `beforeFileSha256`, sets `TestPatch.revertedAt`, emits `heal.rolled_back`, and escalates. The patch row is **retained as evidence** — a heal that had to be undone is the most informative row in the system, and deleting it would erase the cheapest early warning we have ([ADR-001](../decisions/ADR-001-veto-gated-healing.md) A1).

> The patch is applied inside a transaction whose commit point is **verification passing**, not **the write succeeding**. That sentence is `FR-710`.

---

## 13. Post-heal verification — `TG-10` (`FR-707`)

```
re-run the healed step          -> verification.healedStepRerun
re-run the ENTIRE scenario      -> verification.fullFlowRerun
both true                       -> Run.status = VERIFIED      (I-7)
anything less                   -> rollback -> ESCALATING
```

The asymmetry is the point, and it is [ADR-010](../decisions/ADR-010-post-heal-verification.md): **a locator that resolves to the wrong element will often pass its own step and break a later one.** A healer that re-runs only the step it touched cannot tell a repair from a plausible mistake. Full-flow verification costs ~2.5 s and is the only thing standing between "healed" and "green on the wrong button".

---

## 14. The defect report (`FR-606`) and the escalation card

### 14.1 The defect report — deterministic, no model needed

Produced for every `PRODUCT_BUG`. All three fields are required by the schema and all three come from stored evidence:

| Field | Source |
|---|---|
| `expected` | `ToolError.detail.expected`, verbatim |
| `actual` | `ToolError.detail.actual`, verbatim |
| `reproduction` | The ordered steps up to and including the failing one, rendered as human instructions, with the target URL and a note that a signed-in session is required |

```
Expected:  "Order total ₹999"
Actual:    "Order total ₹9,999"
Reproduce: 1. Open https://shop.test/products/8841
           2. Click "Add to cart"
           3. Open https://shop.test/checkout
           4. Enter "Ada Lovelace" in Full name
           5. Click "Place order"
           6. Read the order total in the confirmation panel
Evidence:  ev_101 (screenshot) · ev_104 (DOM) · ev_107 (network)   — V3 fired
```

That it needs no model is what makes `B2` survive `R-2`: with the key unset, FORGE still finds the defect, still refuses to heal it, and still hands a developer something they can act on.

### 14.2 The escalation card

What a human is shown when the outcome is `ESCALATED`:

- the one question being asked, in a sentence — *"Is `getByRole('button', {name: 'Continue'})` the same control as the `Next` button we recorded?"*;
- the fingerprint's screenshot crop beside the live candidate's crop;
- the top two candidates with all six sub-scores and the margin that triggered `V4`;
- the unified diff that **would** have been applied;
- two buttons: apply, or reject with a reason.

Escalation is a first-class outcome with a complete evidence pack, not a failure with an apology.

---

## 15. Budgets (`P-3`)

| Operation | p50 | Cap | On cap |
|---|---|---|---|
| `collectEvidence` | 700 ms | 3 s | Partial bundle; `UNKNOWN` if under three evidence items |
| `preClassify` | 2 ms | 100 ms | pure |
| Triage call (site 4, `xhigh`) | 2 s | 10 s | Deterministic verdict stands |
| `generateCandidates` | 200 ms | 3 s | Fewer candidates, scored anyway |
| `scoreCandidates` + `applyVetoes` | 3 ms | 100 ms | pure |
| `applyPatch` (recompile + diff + write) | 400 ms | 3 s | Rollback, escalate |
| `verify` (step + full flow) | 2.5 s | 15 s | Rollback, escalate |
| **The whole cycle** | **~6 s** | **40 s** | Escalate |

Steps 5–11 of the healing data flow ([04 §6](../02-architecture/04-system-architecture.md)) involve **no model call at all**, which is why `P-3` — one heal cycle under 10 s — holds even on a cold API.

---

## 16. Known limitations — state these before a judge finds them

| Limitation | Impact | Production answer |
|---|---|---|
| String similarity, not embeddings | Weak on synonyms (*Submit* vs *Place order*) | A local embedding model, with the lexical score kept as a floor |
| Weights and thresholds tuned on 7 cases | Principled, not calibrated at scale | Label 500 real breakages, fit the weights, report precision and recall |
| The destructive lexicon is English-only | Misses localised UIs | An i18n lexicon plus an intent classifier |
| Single-element healing | Cannot repair a restructured flow — a step that moved to a new page | Flow-level re-planning: send the capability back through the Planner rather than the Healer |
| `V5` needs a baseline | The first-ever run of a scenario has nothing to compare against | Generation-time validation is the baseline ([12 §4](12-generator.md)), so in practice there always is one |
| Vetoes are recall-oriented | Some safe heals get blocked | The correct trade: a false block costs a human a minute; a false heal costs a production incident |

The last row is the one to volunteer unprompted. It shows the asymmetry was chosen, not stumbled into.

---

## 17. Related documents

- Why healing is veto-gated rather than threshold-gated → [ADR-001](../decisions/ADR-001-veto-gated-healing.md) — **the thesis**
- Why the scoring is arithmetic → [ADR-004](../decisions/ADR-004-locator-scoring.md)
- Why the whole flow re-runs → [ADR-010](../decisions/ADR-010-post-heal-verification.md)
- Why the plan is patched, not the code → [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md)
- The error codes every verdict switches on → [06 §1](../02-architecture/06-agent-contracts.md)
- The generation-time ladder and why it differs → [12 §3.2](12-generator.md)
- Where healer actions and defects surface → [14 §5, §6](14-quality-report-and-score.md)
