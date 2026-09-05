# ADR-017 · Only arithmetic may block the pipeline

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 |
| **Deciders** | All |
| **Requirements** | `FR-301`, `FR-303`, `FR-304`, `FR-308`, `NFR-1`, `NFR-2` |
| **Governs** | [11 · Coverage Critic §5.2](../03-algorithms/11-coverage-critic.md) · [04 §3.3 `TG-5b`](../02-architecture/04-system-architecture.md) |
| **Related** | [ADR-001](ADR-001-veto-gated-healing.md), [ADR-008](ADR-008-orchestration-topology.md), [ADR-011](ADR-011-agent-topology.md) |

---

## 1. Context

The brief's clause `M4` requires the system to *"evaluate coverage before generating tests"*. The Critic exists to do that, and it has two halves: arithmetic over the capability subgraph, and a model asked what a thoughtful tester would have added ([11 §2](../03-algorithms/11-coverage-critic.md)).

Both halves produce `Gap` objects, and `Gap` carries a `severity`. A `BLOCKER` gap stops the lap at `TG-5b` and sends the plan back to the Planner. So one question has to be answered before the Critic can be built: **may a gap the model invented carry `BLOCKER` severity?**

It sounds like a detail about an enum. It is the question of who is allowed to stop the pipeline.

---

## 2. The two options

### Option A — Both halves may block

The model's judgement gaps carry whatever severity the model assigns. A semantic gap the model considers critical — *"nothing verifies that a declined card leaves the cart intact"* — blocks the transition exactly as a structural blocker does.

**Its real advantages, stated properly:**

- **It blocks on the things that actually matter.** Arithmetic can tell that a class of scenario is missing; it cannot tell that the *specific* missing scenario is the one that would have caught a payment double-charge. The model can, sometimes, and those are the gaps worth blocking on.
- **It is the honest reading of `M4`.** The brief asks the system to evaluate coverage, not to compute a ratio. A Critic whose most insightful findings are advisory is a Critic that was overruled by its own architecture.
- **It needs no clamp, no special case, no explanation.** One severity scale, one rule, and the gate simply means what it says.

### Option B — Only deterministic rules may mint or clear a `BLOCKER` *(chosen)*

Model gaps are clamped to at most `MAJOR` in code, on receipt, before the merge. Blockers come exclusively from the eight rules in [11 §5.3](../03-algorithms/11-coverage-critic.md) and the PRD MUST-rule in §8. A blocker is retired only by a subsequent plan satisfying the rule that minted it.

---

### Comparison

| Criterion | A · both halves block | **B · only arithmetic blocks** |
|---|---|---|
| Blocks on semantic insight | **Yes** | No — it is recorded as `MAJOR` and reported |
| Same plan, same verdict, five times (`FR-303`, `NFR-1`) | No | **Yes** |
| `TG-5b` unit-testable on a fixture with no model | No | **Yes** |
| Behaviour with `ANTHROPIC_API_KEY` unset (`NFR-2`, `FR-308`) | The gate silently weakens | **Identical** |
| `EC-03` (reject → re-plan → clear) reproducible in CI | Flaky | **Deterministic** |
| Can a persuasive model stall a lap indefinitely? | Yes — and there is no recovery except a timer | **No** |
| Can a persuasive model wave a bad plan through? | Yes | **No** — it cannot clear a blocker either |
| Explains in one sentence to a judge | "The model decides" | "Arithmetic decides; the model advises, and both are recorded" |

---

## 3. Decision

**Model-authored gaps are clamped to `MAJOR`. Only deterministic rules mint a `BLOCKER`, and only a deterministic rule retires one.**

Three arguments, in ascending order of weight.

### 3.1 The gate must survive the model being gone

`NFR-2` and `FR-308` are not aspirations we degrade toward; rehearsal `R-2` runs the entire demo with the key unset. Under Option A that run has a *different and weaker gate* than the run we demonstrate — the guard would pass plans it would otherwise have blocked, and nobody watching could tell. A control that changes strength depending on network conditions is not a control.

### 3.2 The interesting direction is the one nobody thinks about

The obvious worry is a model blocking too much. The dangerous case is the opposite: a model **clearing** a blocker. Under Option A, severity is the model's to assign, so a model that considers the missing error-state case acceptable *here* can downgrade it — and the plan proceeds, with a reason that reads perfectly plausible in the log. Under Option B there is no sentence that clears a blocker. The next plan contains the class or it does not.

This is the same asymmetry as [ADR-001](ADR-001-veto-gated-healing.md): the healer's vetoes are evaluated before scores because a veto is not a very low score, and `adjudicate()` may only lower an outcome, never raise it. FORGE has one consistent rule about model authority, and this ADR is that rule applied to the Critic instead of the Healer.

### 3.3 `M4` is what a judge will probe, and this is the answer that survives probing

*"Evaluate coverage before generating"* is the clause every competent entry will claim. The distinguishing question is the follow-up: **what actually stops a bad plan?** Pointing at a prompt is pointing at a hope. Pointing at `verdict()` — nine lines, pure, with a test that runs the same fixture five times and asserts one verdict — is pointing at a control. The clamp is what makes the second answer true.

---

## 4. Consequences

### Accepted costs

- A genuinely critical semantic gap does not block. It is reported at `MAJOR`, appears in `residualGaps`, and reaches the report — but the lap proceeds. We are choosing to ship a test suite with a named hole rather than to make the gate probabilistic.
- Blocking quality is only as good as the eight rules. Adding a blocking condition means writing a rule and a test, not adjusting a prompt. That is slower on purpose.
- One more special case in the merge, which must be in code and not in the prompt — a prompt that says *"do not use BLOCKER"* is not a clamp.

### Risks taken on

| Risk | Mitigation |
|---|---|
| The eight rules miss a class of bad plan we have not imagined | The semantic half still names it at `MAJOR`, and it lands in the report; a recurring `MAJOR` is the signal to promote it to a rule |
| The rules over-block on unusual applications — a read-only dashboard with no negative case | `FR-203`'s stated-reason escape hatch, checked in `classGaps()` |
| "Arithmetic decides" reads as rigid to a judge who wanted to see agentic judgement | The semantic half is fully visible in the decision inspector, gap by gap. We show judgement *and* show what it was not allowed to do |

### Hidden assumptions

1. **That structural rules catch most genuinely bad plans.** Falsifiable, and cheap: `EC-03` and `EC-04` plus every rehearsal record which half minted each blocker. If the arithmetic half never fires on a plan a human would reject, the assumption is wrong.
2. **That `MAJOR` gaps actually get read.** If nobody acts on the report's residual gaps, an advisory finding is the same as a discarded one — and this ADR quietly costs coverage rather than protecting reproducibility.
3. **That the clamp stays in code.** The failure mode is a well-meant later edit that trusts `gap.severity` from the model's output. `packages/core/critic` has one test asserting that a model gap arriving as `BLOCKER` is stored as `MAJOR`.

---

## 5. Flip triggers

| Trigger | Response |
|---|---|
| Measured: model gaps at `MAJOR` that a human later confirms should have blocked, in > 30% of laps | Promote the recurring shapes to deterministic rules. Do **not** raise the clamp |
| The rules block plans a human would accept in > 15% of laps, with zero false passes | The rules are over-broad. Narrow the offending condition, keep the clamp |
| A future build gets a labelled corpus of plans with human accept/reject verdicts | Fit the floor and the rules to it, and report precision and recall. The clamp still stands — a fitted model is still a model |
| `NFR-2` is dropped as a requirement | Re-open this decision honestly. It rests on the offline guarantee more than on anything else |

---

## 6. The sentence to say out loud

> "The model tells us what we missed. It does not get to decide whether we ship. Blocking is nine lines of arithmetic with a unit test — which is why pulling the API key changes what the report *says*, and not what the pipeline *does*."
