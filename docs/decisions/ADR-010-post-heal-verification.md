# ADR-010 · A heal is not accepted until the whole flow re-runs

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P1 (orchestrator owner), P2 (healing owner) |
| **Requirements** | FR-407, FR-408, NFR-3, NFR-9 |
| **Governs** | [13 §11](../03-algorithms/13-triage-and-healing.md) · invariant I-7 |
| **Related risks** | [RK-10](../05-delivery/23-risk-register.md) |

---

## 1. Context

A heal has rewritten a locator and the patched step now passes. The system must decide what that entitles it to claim.

This is the last place the project's thesis can quietly betray itself. Everything upstream — vetoes, deterministic scoring, evidence citation — exists because *a passing test can lie*. If the final gate accepts a single green step as proof, we have rebuilt the tool we spent nine ADRs arguing against, just with better instrumentation.

---

## 2. The two options

### Option A — Re-run the healed step

Re-execute the patched step in place. If it passes, mark the run healed and continue forward through the remaining steps. Cost: about one second.

### Option B — Re-run the healed step, then the entire flow from a clean state *(chosen)*

Re-execute the step; if it passes, reset the SUT to seed and run all steps from the beginning. Only then may the run reach `VERIFIED` (I-7). Cost: roughly 6–8 s for eight steps.

### Comparison

| Criterion | A · step only | B · full flow |
|---|---|---|
| Catches a locator that resolves to the **wrong single element** | No — a wrong element frequently passes its own step | Yes, when a later step or assertion depends on the right one |
| State validity | Continues from a state the first, partial run left behind | Every step runs against seeded state, as a user would meet it |
| Cost inside the 10 s heal budget (NFR-3) | ~1 s | ~6–8 s — **the real tension in this decision** |
| Claim it licenses | "The step passes now" | "The flow still works end to end" |
| Depends on a fast, complete SUT reset | No | Yes (NFR-9) |
| Consistent with the product thesis | No | Yes |

---

## 3. Decision

**Option B.** The loop can only exit `VERIFIED` through `verifyFullFlow`, and I-7 makes that structural: `Run.status = VERIFIED` requires `verification.fullFlowRerun = true`.

The asymmetry that decides it is a specific, common failure mode rather than a general preference. **A locator that resolves to the wrong single element usually passes its own step.** Clicking the wrong button, filling the wrong field, reading the wrong total — each of those succeeds locally and fails, or worse *silently changes behaviour*, several steps later. Option A is blind to precisely the error healing introduces.

The second argument is about state. Option A continues from whatever the failed partial run left behind — a cart half-populated, an order half-submitted. That is a state no real user reaches, so a pass there is evidence about a fiction.

The cost is accepted deliberately: full-flow verification consumes most of the 10 s heal budget. That budget exists to keep the demo watchable, and if the two ever conflict, §7 fixes the priority — **cut evidence capture on the verification pass, never the verification itself.**

---

## 4. Consequences

**What we accept**

- Most of the heal-cycle latency budget goes to re-running steps that already passed.
- Verification depends on `forge reset` / reseed being fast *and complete* (NFR-9). A weak reset makes verification unreliable rather than merely slow.
- The approach does not scale to long flows without scoping (§7).

**What it buys**

- "Healed" and "proven" become the same word, which is the only reason the demo's green tick means anything after a patch.
- EC-02's success criterion is a full 8/8 re-run, not a repaired step — a materially stronger claim for one line of eval output.
- Combined with FR-408's caps (2 per step, 3 per run) the loop is bounded: at most three full flows per run, so the worst case is predictable rather than open-ended.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| The patched `.spec.ts` fails to compile, so verification cannot run and no heal ever reaches `VERIFIED` | RK-10 · 6 | Typecheck the regenerated file before verification; contingency is to verify against the in-memory `TestSpec` and report the file write separately ([ADR-006](ADR-006-spec-as-source-of-truth.md)) |
| Full-flow re-runs push the heal cycle past 10 s (NFR-3) | not registered | The explicit priority order in §7 — evidence breadth is the thing that gives way |
| An incomplete reset makes verification fail for reasons unrelated to the heal | not registered | See A2. A verification failure diagnosed `ENVIRONMENT` is the tell |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | The flow is short enough to re-run (8 steps, ~6 s) | Verification cost scales linearly with flow length. At 200 steps this design is untenable and must become scoped | Heal cycle exceeding 10 s. That is a length problem wearing a latency costume, and the fix is §7's scoping, not a faster machine |
| A2 | The SUT resets deterministically between attempts | A stale order or an un-cleared mutation makes the re-run fail for an unrelated reason — and we would then **mis-diagnose a good heal as a bad one**, the most confusing possible failure | A verification failure whose diagnosis is `ENVIRONMENT`. Worth treating as a harness bug rather than a product finding |
| A3 | A full-flow pass means the heal was right | It does **not**. It means no assertion *in this flow* noticed. A wrong-element heal can pass a flow with weak assertions, and our flows are ours to write | The production answer is available and cheap: after a heal, capture the new fingerprint and assert it is within a similarity band of the old one. We have the fingerprint machinery already; **this check is not currently specified anywhere**, and it is the strongest single upgrade to this ADR |
| A4 | 2 heals per step and 3 per run is enough (FR-408) | Derived from the eval set, not from data. Too low blocks legitimate multi-break runs; too high makes the demo unwatchable | EC-04 exits `ESCALATE` after exactly 2 attempts. Beyond the eval set we have no evidence, and should not imply we do |
| A5 | Re-running passed steps is side-effect-free | True for our seeded SUT. False for anything that sends email, charges a card, or writes to a shared system — where a "safe" re-verification is a second real order | Any SUT with external effects. Then verification needs a dry-run or sandbox mode, and this ADR's cost calculation changes completely |
| A6 | Verification runs the *patched* spec, not a cached compilation | A stale artifact would verify the old locator and report success — a false `VERIFIED`, the worst outcome in the system | Regeneration happens before verification in the sequence ([13 §12](../03-algorithms/13-triage-and-healing.md)); nothing currently asserts the compiled file's hash changed. A one-line check |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| The heal cycle exceeds 10 s (NFR-3) | **Do not** drop to step-only verification. Cut evidence capture on the verification pass — screenshots at assertion steps only, no trace, no DOM snapshots on already-passing steps. Evidence breadth is recoverable; a false `VERIFIED` is not |
| Flows exceed ~30 steps | Introduce dependency-scoped verification: the healed step plus every downstream step touching the same route or state, still from a clean seed. Never re-run *forward only* from the failure point |
| A heal passes full-flow verification and is later reverted by a human | A3 has failed. Add the post-heal fingerprint-similarity gate as a hard requirement, not an enhancement |
| The SUT acquires external side effects (A5) | Verification needs a sandbox or dry-run mode before this policy can hold. Until then, escalate instead of verifying |
| `ENVIRONMENT` diagnoses appear on verification re-runs | Fix reset completeness (NFR-9). Do not weaken verification to route around a flaky reset |

---

## 8. Related

- [ADR-001 · Veto-gated healing](ADR-001-veto-gated-healing.md) — the gates *before* the patch; this is the gate after it
- [ADR-006 · TestSpec as source of truth](ADR-006-spec-as-source-of-truth.md) — what must compile before verification can run
- [ADR-007 · Demo app](ADR-007-demo-app.md) — the reset guarantee this ADR depends on
- [13 §11](../03-algorithms/13-triage-and-healing.md) — the bounded loop and its terminal conditions
