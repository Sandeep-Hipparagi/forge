# ADR-011 · A deterministic meta-agent over agentic sub-agents

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 — the day the problem statement arrived |
| **Deciders** | All |
| **Requirements** | `FR-901`, `FR-902`, `FR-903`, `FR-905`, `NFR-1`, `NFR-4` |
| **Governs** | [04 · System Architecture](../02-architecture/04-system-architecture.md) · [01 §4](../01-foundation/01-vision-and-scope.md) |
| **Amends** | [ADR-008](ADR-008-orchestration-topology.md) — see §6 |
| **Related** | [ADR-002](ADR-002-llm-role.md), [ADR-012](ADR-012-capability-lap.md) |

---

## 1. Context

The brief asks for something with a precise shape:

> *"The agent should coordinate a pipeline of three specialised sub-agents… The **meta-agent must coordinate this pipeline intelligently** — evaluating coverage quality between stages, deciding when to re-plan or escalate."*

Two words are doing the work: **sub-agents** and **intelligently**. Read carelessly, they demand a swarm of autonomous LLM agents negotiating over a bus. Read carefully, they demand something more specific: a coordinator that *makes decisions between stages* and can be **held to account for them**.

[ADR-008](ADR-008-orchestration-topology.md), written before the brief arrived, chose "one FSM, logical modules, not agents" — and rejected agents wholesale. That was the right call for the healing path and the wrong call for exploration, because exploration is the one part of this system whose steps genuinely cannot be enumerated in advance. You cannot write a finite state machine that knows what is on a page it has never seen.

So the real question is not *agents or not*. It is: **where is the boundary between the part that must improvise and the part that must be provable?**

---

## 2. The three options

### Option A — Fully agentic: an LLM supervisor with handoffs

A supervisor model holds the goal and delegates to Planner/Generator/Healer, deciding at each turn who acts next. The 2026 default for multi-agent demos; what OpenAI Swarm, LangGraph supervisors and CrewAI hierarchies look like.

**Its real advantages, stated fairly:** genuinely adaptive — handles a target that behaves unexpectedly without a code change. Fewest lines of code for the widest behaviour. Demos beautifully when it works.

### Option B — Fully deterministic: the ADR-008 position

An FSM drives everything; sub-agents are pure functions from evidence to structured output, with no loops and no tool access.

**Its real advantages:** maximally auditable, cheapest, fastest, testable without a browser.

### Option C — Deterministic meta-agent, agentic sub-agents *(chosen)*

The orchestrator is a typed FSM: transitions enumerated, guards in code, every step persisted before it is emitted. Inside a stage, a sub-agent that faces an open-ended task (Explorer, Planner, Critic, Triage) runs a **bounded tool loop** — model, typed tools, hard iteration and token ceilings, structured output validated on exit. Sub-agents whose task is closed (Generator, Runner, Reporter, the healing scorer) are plain deterministic code with no model at all.

### Comparison

| Criterion | A · full swarm | B · full FSM | **C · hybrid** |
|---|---|---|---|
| Can explore an unseen application | Yes | **No — the disqualifier** | Yes |
| *"Full pipeline runs end to end"* (30%) | Probabilistically | Yes | Yes |
| Reproducible verdict for the same inputs | No | Yes | Yes — verdicts are FSM-side |
| Debugging a wrong outcome | Read a transcript, infer intent | Read a state and its inputs | Read a state; open the one sub-agent trace |
| Enforcing "2 heal attempts per step" (`FR-708`) | A prompt instruction the model may ignore | A counter | A counter |
| Enforcing "no `GENERATE` without a `CoverageAssessment`" (`FR-301`) | A hope | A guard | **A guard** |
| Cost per session | 5–10× | 1× | ~1.5× |
| Wall clock for one capability lap | Minutes, unbounded | Seconds | ~90 s, bounded |
| Behaviour when the model is down | Dead | Full | Degraded but complete (`NFR-2`) |
| Recoverable after a mid-run crash | No | Yes | Yes |
| Survives a hostile question about non-determinism | No | Yes | Yes |

---

## 3. Decision

**Adopt Option C.** The boundary is drawn by one test:

> **Does this stage face an open world?**
> Yes → bounded agentic loop. No → deterministic code.

| Stage | Open world? | Implementation | Ceiling |
|---|---|---|---|
| Explorer | Yes — an unseen application | Tool loop over `snapshot`, `click`, `fill`, `navigate`, `back` | 40 tool calls, 90 s |
| Planner | Yes — what is worth testing is a judgement | Tool loop with read-only page access | 12 tool calls per capability |
| Critic | Partly — gaps are judgement, structure is arithmetic | Deterministic structural score **plus** one model call for semantic gaps | 1 call |
| Generator | **No** — a plan is a closed input | Pure compiler, plus live locator probing | — |
| Runner | **No** | Playwright | — |
| Triage | Partly | Deterministic pre-classifier, then ≤ 1 refining call | 1 call |
| Healer | **No** | Candidate ladder + weighted arithmetic; a model call only in the 0.65–0.85 band | ≤ 1 call |
| Reporter | **No** | Arithmetic and templating | — |
| **Orchestrator** | **No — by construction** | Typed FSM | — |

The orchestrator's intelligence is not *"it prompts itself to think"*. It is the guards:

```ts
// The brief's hard MUST, expressed as something a compiler and a test can check.
case "PLANNED":
  return assessment.blockers.length === 0 && assessment.score >= COVERAGE_FLOOR
    ? { next: "GENERATING" }
    : replanRounds < MAX_REPLAN_ROUNDS
      ? { next: "PLANNING", carry: assessment.gaps }   // send it back, with reasons
      : { next: "GENERATING", accept: assessment.gaps }; // proceed, risk recorded
```

That is fourteen lines. It is also the single most-graded behaviour in the brief, and it is *checkable* — which a prompt asking a supervisor to "evaluate coverage quality" is not.

### 3.1 Why this is more impressive, not less

The pitch answer, in one breath:

> "Our sub-agents improvise where the world is open — exploring an app nobody has seen. Our orchestrator does not improvise at all, because the decisions it makes are the ones you'd want to audit: did it check coverage before generating, did it stop after two heal attempts, did it refuse to heal a real bug. We put the judgement where judgement helps and the guarantees where guarantees matter."

A judge who has watched four swarm demos wobble will recognise that answer as the one from a team that has shipped something.

---

## 4. Consequences

### Accepted costs

1. **FORGE cannot improvise its way out of a novel stage failure.** If the Planner produces something the Critic cannot assess, the lap escalates rather than inventing a path. This is the same cost [ADR-008](ADR-008-orchestration-topology.md) accepted, and we accept it again with open eyes.
2. **Two programming models in one codebase.** Tool loops and pure functions read differently. Mitigated by confining every loop to `packages/agents/*` behind one `runAgentLoop()` harness with a single retry, budget and validation policy.
3. **Sub-agent traces are a second debugging surface** alongside the event log. Mitigated by writing each loop's transcript as content-addressed evidence, linked from the state that invoked it.

### Risks taken on

| Risk | Mitigation |
|---|---|
| An Explorer loop burns its budget on a pagination trap | Structural state deduplication (`FR-108`) plus a hard call ceiling |
| A sub-agent returns valid JSON that is semantically wrong | The next stage validates against reality — the Generator probes every locator live (`FR-402`) |
| Two programming models slow a tired team at hour six | The harness is written in Phase 1, before any sub-agent exists |

### Hidden assumptions

- **A1.** That accessibility snapshots are a sufficient perception channel for exploration on real applications. *Untested against a canvas-heavy or heavily custom-widget app.* Cheap check: run the Explorer against one such target in Phase 2 and record what it misses.
- **A2.** That a 40-call ceiling is enough to map a meaningful portion of a mid-sized app. If not, the fix is a wider frontier batch, not a higher ceiling.
- **A3.** That the model reliably emits schema-valid structured output under tool-use forcing. Falsified by any run needing more than one repair retry — instrument the repair-retry count from day one.

---

## 5. Flip triggers

Reverse toward **Option A** if: the Critic's re-plan loop turns out to need judgement the FSM cannot express, *and* three consecutive real targets escalate on cases a human finds obvious.

Reverse toward **Option B** if: sub-agent loops prove too slow or too costly to finish a lap within `P-2` (90 s), *and* a purely structural Explorer reaches acceptable capability maps on our three targets.

Neither trigger fires on a single bad run. Both require a pattern across three distinct targets — a rule we hold to precisely because hour six is when a single bad run feels like a pattern.

---

## 6. Relationship to ADR-008

[ADR-008](ADR-008-orchestration-topology.md) is **amended, not superseded**. Its argument — that limits must be counters rather than instructions, that transitions must be persisted before they are emitted, that the safety path must contain no model — stands unchanged and is the backbone of this ADR.

What changes is its scope. ADR-008 rejected agents everywhere because, under the assumed problem, the system never faced an open world: the target was our own application and the test intent was supplied by a human. The real brief supplies neither. Exploration is open by definition, so agency enters the system — and is confined, by this ADR, to the stages that face the open world and kept out of every stage that produces a verdict.

One sentence, if you only keep one: **agency where the world is unknown, determinism where the answer will be audited.**
