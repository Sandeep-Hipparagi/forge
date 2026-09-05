# ADR-003 · Design intent comes from a hand-authored contract, not the Figma API

| | |
|---|---|
| **Status** | **Superseded by [ADR-013](ADR-013-design-intelligence-deferred.md)** on 4 Sep 2026 — the design pillar is deferred, so there is no contract to source. Retained for the record. |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P4 (design owner) · P5 consulted |
| **Requirements** | FR-501, FR-106 (deferred), FR-504, NFR-2 |
| **Governs** | [deferred/design-intelligence.md §2](../deferred/design-intelligence.md) · `fixtures/design/` |
| **Related risks** | [RK-01](../05-delivery/23-risk-register.md) |

---

## 1. Context

Design intelligence needs a statement of **what should be there** to compare the rendered page against. There are two plausible places to get one: the design tool that produced the intent, or a file we write ourselves.

The obvious answer is the design tool — it is where intent actually lives, and "we read your Figma" is a better sentence than "we wrote a JSON file". The obvious answer is wrong here, and the reasons are worth writing down because this is the decision a skeptical judge attacks first.

---

## 2. The two options

### Option A — Live Figma API

Fetch file nodes at run time, derive expected element geometry, names and styles from the node tree.

### Option B — Hand-authored `DesignContract` JSON + reference PNG *(chosen)*

A committed contract in `fixtures/design/`: element facts (role, accessible name, bounds, computed style) plus **declarative rules** ("the primary CTA must remain visible without scrolling"), plus masks for volatile regions, plus a reference screenshot. Figma becomes an importer later (FR-106).

### Comparison

| Criterion | A · Figma API | B · authored contract |
|---|---|---|
| Proximity to real designer intent | Direct | One transcription step away |
| Demo-day network dependency | Hard dependency (NFR-2 broken) | None |
| Auth, tokens, rate limits | All three | None |
| Mapping cost | High — a Figma node tree carries **no roles and usually no accessible names**. Those must be inferred or annotated | Zero — the contract *is* the target format |
| Geometry comparability | Frame coordinates ≠ rendered CSS pixels; needs a scale/layout model | Authored in rendered px against the DOM contract, verified to ±2 px |
| Can express a *rule* ("above the fold") | No — Figma has no such concept | Yes. This is the half of the module that matters most |
| Masks for volatile regions (FR-504) | Would need annotation conventions anyway | First-class in the format |
| Scales to 50 screens | Yes | No — linear human cost |
| Credibility objection | "You read the real design" | "You wrote both the question and the answer" |

---

## 3. Decision

**Option B**, with the contract format designed as the **mapping target** a Figma importer would later write into — so the choice defers work rather than duplicating it.

Three reasons, in order of weight:

1. **The rules are the product, and Figma cannot express them.** DC-04 (CTA above the fold), DC-08 (error-message adjacency), DC-10 (responsive reachability) are constraints, not measurements. No design tool exports them. Even with a perfect Figma integration we would still be hand-authoring the interesting half of the contract — so the integration buys us the *cheap* half at the cost of a network dependency on demo day.
2. **Figma has no accessibility model.** Our checks are keyed on role and accessible name, because those are what survive refactors and what the locator ladder trusts. A Figma frame is a rectangle with a layer name. Deriving `role: "button", accessibleName: "Place order"` from that is inference, and inference at the *expectation* layer would make every finding arguable.
3. **NFR-2.** Adding a third-party HTTP dependency to the one path that must work on venue wifi contradicts the resilience posture the rest of the architecture is built on.

### 3.1 Answering the credibility objection directly

*"You wrote the expectations, so of course they pass."* This is fair and must be answered in one breath:

- The contract is authored **from the SUT's DOM contract** (T-501), before any check code exists, by the design owner — not fitted afterwards to whatever the page happened to render.
- The SUT never learns what the contract says. Mutations are described in the SUT's own vocabulary (`cta.id`, `total.amount`), never in FORGE's, and the `sut-is-isolated` build rule enforces the separation ([19 §5.1](../04-build/19-target-apps.md)).
- What is being demonstrated is **the check catalogue** — ten pure functions over an inspection payload — not the authoring. Each has a passing *and* a failing fixture (FR-502).

That answer is stronger than a Figma integration would have been, because it is a claim about isolation rather than about provenance.

---

## 4. Consequences

**What we accept**

- One screen, one breakpoint, one hand-written contract ([09 §7](../deferred/design-intelligence.md)).
- Human cost scales linearly with screens under contract.
- No component-library or token awareness — a finding says "background is `#4f39d6`", not "the CTA is using the wrong token".

**What it buys**

- Design checks run with the network unplugged.
- Geometry is authored in the same units the runner measures, so DC-05's ±2 px tolerance is meaningful rather than aspirational.
- The contract can carry masks and rules, which is what makes design findings *actionable* instead of a pile of pixel diffs.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| Rendered geometry drifts across machines or browser revisions, so DC-05 fires on an unmutated SUT | RK-01 · 6 | Pinned Chromium revision in the CI cache key, self-hosted woff2, `scrollbar-gutter: stable`, animations off, frozen clock. Contingency: raise tolerance to 4 px and say so on stage |
| The contract encodes a rendering accident rather than an intent | not registered | Authored from the DOM contract by a second person before check code exists |
| A judge treats the authored contract as circular reasoning | not registered | §3.1, delivered in one breath, unprompted |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | Designer intent is expressible as element facts + declarative rules | Intent that lives in a token system ("use the brand token, whatever its current value") becomes unexpressible, and findings are true-but-useless — *"colour changed"* when the token changed deliberately | Findings a designer looks at and shrugs. That is the signal, and it is qualitative; nothing in the eval harness catches it |
| A2 | Rendered geometry is stable enough to compare against authored numbers at ±2 px | Every clean run emits a wall of DC-05 findings and the module becomes noise | Exactly RK-01. Watched by running EC-01 on a second machine |
| A3 | Authoring one screen is cheap (≈1 day, one person) | True at one screen; **false at ten**, and that is when the importer stops being optional | Count of contracts in `fixtures/design/`. Three is the threshold (see §7) |
| A4 | A Figma importer is later "a 100-line adapter" | Optimistic. The hard part is not parsing the file, it is mapping frames to roles and accessible names — data Figma files usually do not carry | If the importer turns out to be 1000 lines, **the contract format was still right**; only the migration estimate was wrong. Worth separating those two claims now, before anyone quotes the estimate |
| A5 | Pixel comparison stays a corroborating step, never an originating one | If someone lets pixel diff *originate* findings, the false-positive rate makes the whole module untrustworthy in one afternoon | The precondition list in [09 §4](../deferred/design-intelligence.md) is mandatory; a finding with no structural check behind it is a bug |
| A6 | `MAJOR` design findings on a green functional run read as valuable, not as a hedge | If they read as noise, FR-505's separation looks like an excuse for not failing the run | EC-03 is the test of this — and it is a *narrative* test as much as a technical one |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| More than **three** screens under contract, or a second person authoring contracts | Build the Figma importer (FR-106). The format does not change; only its source does |
| A real design system with exported tokens becomes available | Contract references tokens rather than literal values, and A1's failure mode disappears |
| DC-05 fires on an unmutated SUT (RK-01) | The problem is determinism, not the source. Raise tolerance and pin harder. **Do not** switch to Figma hoping it helps — it would make geometry comparison worse, not better |
| A customer or judge requires "the contract must derive from the actual design file" as an acceptance criterion | The importer moves onto the critical path. Note the cost honestly per A4 |
| Design checks are needed on a page with no contract at all | Run DC-01…DC-03 against a first-run baseline instead; disable DC-04…DC-10. A contract-less mode is a real product need and is not currently specified |

---

## 8. Related

- [ADR-007 · Demo app](ADR-007-demo-app.md) — the DOM contract the design contract is authored from
- [09 · Design intelligence](../deferred/design-intelligence.md) — the check catalogue and the pixel-diff preconditions
- [19 §5.1](../04-build/19-target-apps.md) — the isolation guarantee that answers the circularity objection
