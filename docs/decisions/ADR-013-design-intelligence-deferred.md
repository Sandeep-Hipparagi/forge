# ADR-013 · Design intelligence is deferred, not deleted

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 |
| **Deciders** | All |
| **Requirements** | Retires the pre-brief `FR-501`…`FR-507` |
| **Governs** | [deferred/design-intelligence.md](../deferred/design-intelligence.md) |
| **Supersedes** | [ADR-003](ADR-003-design-contract-source.md) |

---

## 1. Context

Before the brief arrived, *Design Intelligence* was one of the project's two pillars: a `DesignContract` describing intended layout, ten checks `DC-01`…`DC-10` covering presence, naming, hierarchy, geometry, WCAG contrast and responsive reachability, masked pixel comparison against reference screenshots, and a `DESIGN_DRIFT` failure cause. Roughly 600 lines of specification and eight backlog tasks.

Then the problem statement arrived. It mentions design zero times. Visual regression, zero times. Accessibility, zero times. The evaluation rubric has six weighted criteria and none of them touch it.

Meanwhile the brief's actual MUSTs include two capabilities we had not designed at all: autonomous exploration, and coverage-gap evaluation between stages.

The build window is 6–8 hours.

---

## 2. The two options

### Option A — Keep the pillar

Design intelligence stays first-class. It is a genuine differentiator; visual bugs are real bugs; *"we also catch what a functional test cannot see"* is a good line in a pitch.

**Its real advantages:** the specification already exists and is good. It differentiates against every competitor who only checks function. If a judge happens to care about design QA, we are the only team that answers.

### Option B — Defer the pillar *(chosen)*

Move the specification to `docs/deferred/`, retire `FR-5xx`, drop `DESIGN_DRIFT` from the cause enum, and spend the reclaimed hours on the Explorer and the Critic.

---

## 3. Decision

**Defer.** The arithmetic is not close.

| | Keep | Defer |
|---|---|---|
| Build cost | ~1.5–2 h of an 8 h budget | 0 |
| Rubric points available | **0** | — |
| Rubric points at risk if the Critic is thin | — | up to 20% |
| New failure modes on demo day | Pixel comparison is the flakiest thing in any QA stack | none |
| Demo time it would consume | ~40 s of a 4:00 script | 0 |
| Reversible later | — | Yes, in full |

The decisive line is the third. `FR-3xx` — coverage-gap evaluation — is a hard MUST *and* the centre of the 20% innovation criterion. Any hour spent on an unscored pillar is an hour not spent on the highest-leverage scored one. Under a 6–8 hour clock that is not a judgement call, it is subtraction.

The second-most decisive line is the fourth. Masked pixel comparison is, empirically, the single most flake-prone component in an automated QA stack — and it would be running live, on stage, against an application we may have seen for the first time that morning. The brief's *"strongly advised"* target may be an app whose fonts render differently on our machine. That is a demo-day failure mode we are choosing not to buy.

### 3.1 What is retained

One thing survives, because it costs minutes and pays in a different currency:

**The `CONTENT_DRIFT` failure cause.** The old enum had `DESIGN_DRIFT`, defined against a design contract we no longer keep. It is replaced by `CONTENT_DRIFT`: the button text changed, a label was reworded, a currency symbol moved. This is one of the most common real causes of a failing E2E test on an arbitrary application, it needs no contract to detect, and confusing it with a locator break is exactly the mistake a naive healer makes. See `FR-601`.

So we lose the design pillar and keep the part of it that was actually load-bearing for the brief's Bonus item.

---

## 4. Consequences

- The specification is preserved verbatim at [`docs/deferred/design-intelligence.md`](../deferred/design-intelligence.md). Nothing is rewritten; it is moved.
- It becomes a **roadmap slide**, which is worth something: *"here is the next pillar, already specified"* answers "what's next?" with a document instead of a hope.
- [ADR-003](ADR-003-design-contract-source.md) (design intent comes from a hand-authored contract) is superseded — there is no contract to source.
- `DesignContract`, `DesignFinding` and the `design` schema module are removed from `packages/core/src/schema`, reducing the frozen surface.

### Risk taken on

| Risk | Mitigation |
|---|---|
| A judge asks *"what about visual bugs?"* | Answer with the deferred spec on screen: *"specified, deliberately descoped against your rubric, here is the design — it is the next thing we build."* A team that can show what it chose **not** to build reads as disciplined, not incomplete. |

### Hidden assumption

**A1.** That the organiser's stated rubric is the actual rubric. If judges score on impressiveness beyond the published criteria, this trade loses. We accept that: designing against the published rubric is the only defensible policy, and a team that guesses at unpublished criteria has no argument when it guesses wrong.

---

## 5. Flip triggers

Reinstate if any one of these becomes true:

- The organiser publishes an addendum that mentions visual, design or accessibility quality.
- The Explorer and Critic land ahead of schedule with more than 90 minutes of slack before the freeze — in which case `DC-06` (WCAG AA contrast on primary actions) returns first. It is the cheapest check in the set, needs no reference image, and turns into a real finding in the quality report rather than a pixel diff nobody trusts.
- We ship this beyond the hackathon. Then the pillar returns in full, because for a real customer the argument reverses entirely: nobody outside a hackathon cares about a rubric.
