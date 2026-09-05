# ADR-002 · The LLM decides over evidence; it does not drive the browser

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P1 (agent owner) · P2, P5 consulted |
| **Requirements** | FR-303, FR-304, FR-305, NFR-1, NFR-2, NFR-5, NFR-7 |
| **Governs** | [04 §5](../02-architecture/04-system-architecture.md) · [07](../02-architecture/07-llm-integration.md) · [06](../02-architecture/06-agent-contracts.md) |
| **Related risks** | [RK-04](../05-delivery/23-risk-register.md), RK-05 |

---

## 1. Context

Every tool in this space has to answer one question: *how much of the loop does the model own?* The fashionable answer in 2026 is "all of it" — give the model browser tools, describe the goal, let it navigate, click, observe and decide. It demos beautifully for ninety seconds.

Our constraints make that answer expensive:

- **NFR-1** promises the same verdict for the same commit. Model calls are not bit-deterministic even at fixed effort.
- **NFR-2** promises everything except the model call works with no internet, at a venue we do not control (RK-04).
- **NFR-5** forbids executing model output.
- **NFR-3** budgets 45 s for a clean suite and 10 s for a heal cycle. Each browser-driving round trip costs 1–3 s.
- The product's entire claim is *auditability*. A judge asking "why did it heal that?" must get arithmetic, not a transcript.

---

## 2. The two options

### Option A — Autonomous agent loop

The model holds browser tools (`click`, `type`, `read`, `screenshot`), receives the intent, and free-roams until it believes the goal is met. On failure it inspects the live page and decides for itself whether to repair the locator.

### Option B — Constrained decision-maker *(chosen)*

Exactly **three** call sites, each with a Zod-validated structured output, each with a deterministic fallback. A finite state machine drives the browser ([ADR-008](ADR-008-orchestration-topology.md)).

| # | Call site | Model's job | Fallback |
|---|---|---|---|
| 1 | **Plan** | intent → `TestSpecDraft` (strategy + args, never a locator string) | cached spec from `fixtures/specs/` |
| 2 | **Diagnose** | evidence bundle + pre-classification → `Diagnosis` (agree, refine, or dissent) | deterministic classifier verdict |
| 3 | **Adjudicate** | two near-tied candidates → recommendation, **can only lower the outcome** | `ESCALATE` |

Candidate generation, scoring, vetoes, patching, verification and design checks contain no model call at all.

### Comparison

| Criterion | A · agent loop | B · three call sites |
|---|---|---|
| Verdict determinism (NFR-1) | None — same input, different path | Full: pre-classifier + vetoes are deterministic and take precedence |
| Works offline (NFR-2) | Not at all | Yes, at degraded diagnosis *prose* — verdicts unchanged |
| Heal-cycle latency | 15–40 s (many round trips) | ~6 s, of which ~2 s is one diagnosis call |
| Cost per demo cycle | $2–8 | ≈$0.20 |
| Auditability | A transcript you must read | A signals table you can check with a calculator |
| Injection surface (NFR-5) | Model emits actions and often code | Model emits **data**; a deterministic compiler emits code |
| Unit-testable without a browser | No | Yes — the whole decision layer is pure |
| Handles a page shape we never anticipated | Better | Worse — bounded by the tool contracts |
| Debuggable at 2am on D-1 | No | Yes |
| First-impression "wow" | Higher | Lower — until the offline run lands |

---

## 3. Decision

**Option B.** The governing sentence is: *the LLM is a decision-maker over structured evidence, never a browser driver.*

Three properties make this more than a preference:

1. **The model emits data, never code.** Plan returns `{strategy: "role_name", args: {role: "button", name: "Place order"}}`; a deterministic compiler turns that into `getByRole('button', { name: 'Place order' })`. This closes the code-injection path in NFR-5, makes the locator-ladder rule FR-104 mechanically enforceable, and removes malformed selectors as a class. See [ADR-006](ADR-006-spec-as-source-of-truth.md).
2. **The pre-classification is in the prompt.** Diagnose is asked to *agree, refine, or dissent with a stated reason* — not to classify from scratch. Dissent is a logged signal rather than a silent override. If `preClassification.final === true` (a veto fired) the call is skipped entirely (FR-304).
3. **Adjudicate can only be more cautious than the arithmetic.** Its output moves an outcome down the ladder (accept → review → escalate), never up. Ceilings are set by arithmetic; the model may not raise them.

Option A was rejected not because it is worse in general — for exploratory testing of an unknown app it is clearly better — but because it is worse *at the thing we are claiming*. A system whose pitch is "we show our work" cannot have its central decision live in a place where the work cannot be shown.

---

## 4. Consequences

**What we accept**

- FORGE cannot improvise. A page shape outside the tool contracts produces `UNKNOWN` and escalates, rather than a creative workaround.
- Three call sites is a ceiling we must defend against; each addition is latency, cost and a failure mode ([04 §4](../02-architecture/04-system-architecture.md)).
- Diagnosis prose varies run to run. We state this out loud rather than implying reproducibility we do not have ([07 §8](../02-architecture/07-llm-integration.md)).

**What it buys**

- RK-04 — the scariest-looking risk in the register — is engineered down to a banner. Rehearsal R-2 runs the entire demo with `ANTHROPIC_API_KEY` unset.
- A `DETERMINISTIC MODE` chip in the UI means we never accidentally claim reasoning we did not do.
- Cost lands at ≈$0.20 per cycle against a $1.00 budget (NFR-7).

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| Model unavailable, rate-limited or refusing on D0 | RK-04 · 6 | The resilience ladder ([07 §5](../02-architecture/07-llm-integration.md)); deterministic verdicts are identical, only prose degrades |
| Structured output repeatedly fails schema validation | RK-05 · 2 | One repair retry with the issue list, then deterministic. `repairUsed` is logged |
| Prompt-cache invalidation silently triples cost and latency | not registered | `usage.cache_read_input_tokens` checked before the freeze; a zero there is also a determinism smell |
| A fourth call site is added under time pressure | not registered | Any new call site requires an amendment to this ADR |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | The deterministic pre-classifier is accurate enough that the model's role is genuinely *refinement* | The offline fallback produces wrong verdicts, and NFR-2's "identical verdicts with no network" is a claim we cannot support | R-2 requires deterministic-mode verdicts to match LLM-mode verdicts on EC-01…EC-07. That proves it **on seven cases, not in general** — and we should say so in exactly those words |
| A2 | The evidence bundle is sufficient; the model never needs to look at the page | Failures whose relevant fact was never captured (shadow DOM, hover-only state, an iframe) diagnose as `UNKNOWN` | The `UNKNOWN` rate. It is the single most informative number the diagnosis layer produces and nothing currently graphs it |
| A3 | Three is the right number of call sites | The obvious fourth is "summarise the evidence pack for a human". It is excluded as presentation, not reasoning | If it is ever added it must be structurally incapable of altering a verdict — a renderer, not a decider |
| A4 | Never letting Adjudicate *raise* an outcome costs us nothing | It costs us exactly one thing: if the scorer is systematically under-confident, the model is forbidden from correcting it | First-encounter heals are capped at 0.90 because `historical` is necessarily 0.00. That cap is a scorer property. **The fix is the scorer, never the model** |
| A5 | Dissent between pre-classifier and model is rare enough to be a signal rather than noise | If they disagree often, logging dissent is theatre and one of the two is wrong | Dissent rate across eval runs. A rate above ~20% means the pre-classifier needs work, not that the model needs more authority |
| A6 | Refusals on this content are rare | Opus 5 returns `stop_reason: "refusal"` at HTTP 200; unguarded, that reads as an empty result | Guarded explicitly before content is read ([07 §2](../02-architecture/07-llm-integration.md)). Server-side fallback handles routing so we maintain no model list |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| `UNKNOWN` diagnoses exceed 20% because the evidence bundle is too thin | Add a **read-only, bounded** page-inspection tool at the Diagnose site — still no actions, still no browser control — and re-verify NFR-1 before merging |
| A labelled corpus shows model diagnosis accuracy vastly exceeds the deterministic classifier | Raise the model's authority over `Diagnosis.kind` — but vetoes stay final. That boundary is [ADR-001](ADR-001-veto-gated-healing.md)'s, not this one's |
| p95 Diagnose latency exceeds 5 s and threatens NFR-3 | Drop `effort` from `high` to `medium` **before** removing the call site |
| The product must plan against arbitrary unseen apps with no design contract | Plan's constraints are the bottleneck, not this ADR. Revisit Plan alone; Diagnose and Adjudicate are unaffected |
| Cost per cycle exceeds $1.00 (NFR-7) | Cache first, then reduce effort, then drop Adjudicate (it fires perhaps once per demo). Never drop Diagnose — the fallback is a floor, not a replacement |

---

## 8. Related

- [ADR-001 · Veto-gated healing](ADR-001-veto-gated-healing.md) — the safety layer the model cannot reach
- [ADR-006 · TestSpec as source of truth](ADR-006-spec-as-source-of-truth.md) — why the model emits data, not code
- [ADR-008 · Orchestration topology](ADR-008-orchestration-topology.md) — who drives the browser instead
- [07 · LLM integration](../02-architecture/07-llm-integration.md) — the verified call shapes and the resilience ladder
