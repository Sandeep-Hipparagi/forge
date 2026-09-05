# ADR-012 · The Capability Lap is the unit of work

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 |
| **Deciders** | All |
| **Requirements** | `FR-902`, `FR-905`, `FR-907`, `FR-506`, `NFR-3` |
| **Governs** | [04 §3](../02-architecture/04-system-architecture.md) · [11 · Coverage Critic](../03-algorithms/11-coverage-critic.md) · [18 · UI Spec](../04-build/18-ui-spec.md) |
| **Related** | [ADR-011](ADR-011-agent-topology.md) |

---

## 1. Context

An application has capabilities — sign-in, search, cart, checkout, profile, admin. A mid-sized SaaS product has thirty to a hundred. The Explorer will find them all.

What happens next determines whether this tool is usable or merely demonstrable.

The obvious pipeline is **stage-major**: plan everything, then generate everything, then run everything, then heal everything. It is how every tutorial draws a pipeline, and it is what a batch-processing instinct produces. It has three failure modes that only appear at real scale:

1. **The context problem.** Planning capability 40 with capabilities 1–39 in context is expensive, slow, and *worse* — attention dilutes, and the plan for a late capability is measurably weaker than for an early one. The model's quality degrades exactly where the user's patience already has.
2. **The wall of red.** Ninety generated tests run, thirty-one fail. The user is handed thirty-one decisions at once. Every study of alerting says what happens next: they triage none of them and stop trusting the tool. Decision fatigue is not a UX blemish; it is how the product dies.
3. **The all-or-nothing problem.** A crash at 80% yields nothing usable. A budget exhausted at 80% yields nothing usable. There is no partial success, only a partial failure.

---

## 2. The two options

### Option A — Stage-major (batch)

`Plan(all) → Critique(all) → Generate(all) → Run(all) → Heal(all) → Report`

**Its real advantages:** maximum parallelism at every stage. One report at the end. Fewer state transitions. It is the shape the brief's own prose implies when read as a linear pipeline.

### Option B — Capability-major: the Lap *(chosen)*

```
for capability in prioritisedBacklog:          ← ordered by risk, highest first
    Plan → Critique →⟲ Generate → Run → Triage → Heal/Escalate → Verify → Bank
                    └── re-plan, max 2 ──┘
    ▸ capability is DONE. Suite on disk grows by one file. Score updates.
```

One capability is carried all the way to a verified, banked result before the next begins. Each lap opens with a fresh context window containing only that capability's subgraph and the shared shell (auth, base URL, conventions).

### Comparison

| Criterion | A · stage-major | **B · capability lap** |
|---|---|---|
| Context per planning call | Grows with app size — worst at the end | **Constant** — one capability's subgraph |
| Plan quality for capability #40 | Degraded by dilution | Same as capability #1 |
| Time to *first usable artefact* | End of the run | **~90 s** |
| Behaviour on crash at 80% | Nothing usable | 80% of the suite is on disk, verified |
| Failures presented at once | 31 | **0–3, in context, with a fix** |
| Human can steer mid-run | No — everything already generated | Yes, at any lap boundary (`FR-907`) |
| Parallelism | Free at every stage | Across laps, not within (`FR-506`) |
| Total wall clock, serial | Lower | ~15% higher |
| Report | One, at the end | Incremental, final at the end |
| Retry blast radius | The whole stage | One capability |
| Matches how a human QA engineer actually works | No | **Yes** |

---

## 3. Decision

**Adopt the Capability Lap.** Three properties make it more than a scheduling preference:

### 3.1 It is the context-management strategy

This is the reason that matters most and shows least. Agent quality collapses as irrelevant context accumulates — not abruptly, but steadily, in ways that look like the model "getting lazy" late in a run. The Lap makes context a **function of one capability's complexity rather than the application's size**. The pipeline behaves identically on a 5-capability app and a 100-capability app, because no call ever sees more than one capability.

Everything else in this ADR is a consequence of that.

### 3.2 It makes partial success a first-class outcome

Every lap ends by *banking*: the spec file is written, verified and committed to the suite; the score is recomputed; the report is regenerated. Kill the process at any moment and what is on disk is a coherent, runnable, verified suite covering the highest-risk capabilities — because the backlog was risk-ordered.

This is why `COMPLETED_PARTIAL` is a success terminal state (`FR-904`) rather than an error. *"We ran out of budget after 7 of 23 capabilities"* delivers real value when those 7 were the 7 that mattered.

### 3.3 It converts decision fatigue into a conversation

The user is never shown 31 failures. They are shown *this* capability's 2 failures, each with a diagnosis, cited evidence, and either an applied patch or a defect report. Then the next capability. The interaction is a sequence of small, contextualised decisions instead of one impossible one.

That is what *"brick by brick"* means operationally, and it is why the same mechanism serves both the autonomous demo (laps stream past, hands off the keyboard) and the real adopter (laps as review units).

### 3.4 Order is risk, not discovery

The backlog is sorted before lap 1 by a published function of: authentication proximity, data mutation, money or PII involvement, graph centrality, affordance density, and stated user intent (`FR-005`). See [09 · Exploration & Prioritisation](../03-algorithms/09-exploration-and-prioritisation.md).

The first thing the user sees is a test for the thing most likely to hurt them. On a demo clock that is worth more than any other single decision in the system: the first 90 seconds produce the most valuable test, not an alphabetical one.

---

## 4. Consequences

### Accepted costs

1. **~15% higher wall clock in serial mode**, from per-lap setup. Recovered by `FR-506` parallel laps, which the Lap topology makes trivially safe — laps are independent by construction, so workers need no coordination.
2. **Cross-capability insight arrives late.** A shared component broken in five capabilities is diagnosed five times before anyone sees the pattern. Mitigated by a `Diagnosis` cache keyed on failure signature: the second occurrence is recognised, costs no model call, and is reported as *"same root cause as SC-014"*.
3. **The report is regenerated N times.** Cheap — it is arithmetic and templating — and it means a report always exists.

### Risks taken on

| Risk | Mitigation |
|---|---|
| A capability that is genuinely huge (an admin console) blows the lap budget | Per-lap budget; on exhaustion, the lap is split and the remainder re-queued rather than abandoned |
| Capability clustering is wrong, so laps are incoherent | Clustering is reviewable in the UI before lap 1; in Copilot mode it is editable |
| Serial laps look slow on stage | Demo runs with `workers: 4`; the UI shows four laps advancing at once |

### Hidden assumptions

- **A1.** That capabilities are separable enough for a lap to be independently verifiable. False for flows that span capabilities (sign-up → onboarding → first purchase). Handled by allowing a capability to declare `dependsOn`, which the scheduler honours — but this is untested and should be exercised in Phase 3.
- **A2.** That a fresh context per lap costs less than it saves. Given prompt caching on the shared shell, this holds; without caching the arithmetic is closer. Instrument tokens per lap from the first run.
- **A3.** That risk-ordering is stable across runs. If prioritisation is noisy, the "first lap is the most valuable" promise breaks. The ordering function is deterministic given the map — assert this in the eval suite.

---

## 5. Flip triggers

Revert to stage-major if: per-lap overhead exceeds 25% of total wall clock on a 20-capability target, **and** parallel laps fail to recover it.

Adopt a hybrid — batch the Planner, lap everything downstream — if: planning proves to be the cheap stage and per-lap planning latency dominates `P-1`. This is the most likely of the three futures and the cheapest to adopt, because the Critic, Generator and Runner boundaries do not move.

Abandon banking-per-lap if: incremental report regeneration ever costs more than 200 ms. Then bank every 5 laps instead. (Filed as unlikely; the report is a pure function of stored rows.)

---

## 6. The sentence to say out loud

> "It tests the way a good QA engineer does — one capability at a time, hardest first, finishing each one before starting the next. Not because it's slower and more careful for its own sake, but because that's the only way the fortieth test is as good as the first, and the only way you get something usable when we run out of time."
