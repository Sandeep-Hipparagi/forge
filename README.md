# FORGE · Documentation

**FORGE takes a URL and a login, explores the application on its own, and builds a real test suite one capability at a time — judging its own coverage before it writes code, and refusing to heal a test when the product is what actually broke.**

The `main` branch is intentionally a documentation-only MVP baseline. The implementation workspace, dependencies, and executable checks are created from these contracts during `Ph0`; see the root [README](../README.md) for the file policy and technology setup.

Built for the Bessemer Tech Catalyst problem statement from Aivar Innovations: [_Autonomous Test Orchestration Agent_](problem-statement/problem-statment.md).

---

## Start here

**Want the short version first?** → [FORGE story deck](forge-story.html) — a nine-slide visual walkthrough of the problem, loop, trust model, and build plan.

| You are…                  | Read, in order                                                                                                                                                                                      | Minutes |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **New to the project**    | [00 · Problem Alignment](01-foundation/00-problem-alignment.md) → [01 · Vision & Scope](01-foundation/01-vision-and-scope.md)                                                                       | 15      |
| **Judging or evaluating** | [00 §4 rubric map](01-foundation/00-problem-alignment.md) → [01 §8 the mental model](01-foundation/01-vision-and-scope.md) → [decisions/](decisions/)                                               | 20      |
| **Implementing**          | [04 · Architecture](02-architecture/04-system-architecture.md) → [05 · Data Model](02-architecture/05-data-model.md) → your algorithm doc → [15 · Conventions](04-build/15-repo-and-conventions.md) | 45      |
| **Running the day**       | [00 · Work Plan](00-work-plan.md) → [20 · Execution Plan](05-delivery/20-execution-plan.md) → [23 · Risks](05-delivery/23-risk-register.md)                                                         | 20      |
| **Presenting**            | [22 · Demo Runbook](05-delivery/22-demo-runbook.md) → [01 §9 the anti-pitch](01-foundation/01-vision-and-scope.md)                                                                                  | 15      |

**Where are we right now?** → [00 · Work Plan](00-work-plan.md). It is the only file that tracks status, and it is updated in the same commit as the work.

---

## The loop everything maps to

```
Explore → Prioritise → Plan → Critique → Generate → Run → Triage → Heal or Escalate → Verify → Report
```

If a proposed feature does not sit on this loop, it is out of scope. Two steps carry the argument: **Critique**, because a plan nobody checked is a plan nobody should trust, and **Triage**, because a healer that cannot tell a broken test from a broken product is an anti-feature.

---

## The documents

### [01-foundation/](01-foundation/) — what and why

|     | Document                                                   | In one line                                                                                     |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 00  | [Problem Alignment](01-foundation/00-problem-alignment.md) | The brief mapped clause by clause; the rubric mapped weight by weight. **The source of truth.** |
| 01  | [Vision & Scope](01-foundation/01-vision-and-scope.md)     | The loop, the components, what we will not build, success criteria `S-1`…`S-8`                  |
| 02  | [Requirements](01-foundation/02-requirements.md)           | `FR-001`…`FR-909`, `NFR-1`…`NFR-10`, acceptance criteria, the trace matrix                      |
| 03  | [Glossary](01-foundation/03-glossary.md)                   | Shared vocabulary — read before arguing about a word                                            |

### [02-architecture/](02-architecture/) — how the pieces fit

|     | Document                                                         | In one line                                                                           |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 04  | [System Architecture](02-architecture/04-system-architecture.md) | Processes, the orchestrator FSM and its guards, the capability lap, failure isolation |
| 05  | [Data Model](02-architecture/05-data-model.md)                   | Zod schemas → TS types, SQLite DDL, invariants asserted in code                       |
| 06  | [Agent Contracts](02-architecture/06-agent-contracts.md)         | The agent-loop harness, per-sub-agent I/O schemas, the no-throw law, budgets          |
| 07  | [LLM Integration](02-architecture/07-llm-integration.md)         | Models per call site, structured output, caching, the resilience ladder, cost         |
| 08  | [Perception Layer](02-architecture/08-perception-layer.md)       | Accessibility snapshots, state signatures, affordances — and why not raw DOM          |

### [03-algorithms/](03-algorithms/) — the parts that carry the claim

|     | Document                                                                           | In one line                                                                                      |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 09  | [Exploration & Prioritisation](03-algorithms/09-exploration-and-prioritisation.md) | Login detection, the frontier, deduplication, the deny-list, capability clustering, risk ranking |
| 10  | [Planner](03-algorithms/10-planner.md)                                             | Grounded scenarios, Markdown and JSON from one source, stable ids, priority                      |
| 11  | [Coverage Critic](03-algorithms/11-coverage-critic.md)                             | The gap classes, the blocking floor, the re-plan loop, PRD gap analysis                          |
| 12  | [Generator](03-algorithms/12-generator.md)                                         | The deterministic compiler, the locator ladder, live validation, portable output                 |
| 13  | [Triage & Healing](03-algorithms/13-triage-and-healing.md)                         | Six causes, fingerprints, six-signal scoring, vetoes `V1`…`V5`, patch, rollback, verify          |
| 14  | [Quality Report & Score](03-algorithms/14-quality-report-and-score.md)             | The five mandated contents, the Robustness Score, the projected delta, flow risk                 |

### [04-build/](04-build/) — what to type

|     | Document                                                  | In one line                                                                         |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 15  | [Repo & Conventions](04-build/15-repo-and-conventions.md) | Layout, the enforced import graph, the CLI, git, Definition of Done                 |
| 16  | [Agent Test Suite](04-build/16-agent-test-suite.md)       | How we test the agent — **written before the agent**. Golden cases `EC-01`…`EC-07`. |
| 17  | [API Spec](04-build/17-api-spec.md)                       | REST + SSE, the session lifecycle, event envelopes, error shapes                    |
| 18  | [UI Spec](04-build/18-ui-spec.md)                         | Tokens, five screens, the decision inspector, performance budgets                   |
| 19  | [Target Applications](04-build/19-target-apps.md)         | Three targets, the injectable defects, the cold-switch procedure                    |

### [05-delivery/](05-delivery/) — how it ships

|     | Document                                           | In one line                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------- |
| 20  | [Execution Plan](05-delivery/20-execution-plan.md) | Eight hours in six phases, exit gates, what gets cut and when       |
| 21  | [Resilience](05-delivery/21-resilience.md)         | Retry, rollback, circuit breakers, degraded mode, budget exhaustion |
| 22  | [Demo Runbook](05-delivery/22-demo-runbook.md)     | The 4:00 script, the 2:30 cut, failure drills, Q&A                  |
| 23  | [Risk Register](05-delivery/23-risk-register.md)   | Risks with triggers and owners; the floor that is never cut         |

### [06-knowledge/](06-knowledge/) — the self-improving knowledge base

What we learned, captured as we learn it, so the next session starts where this one ended.

### [decisions/](decisions/) — the ADRs

Seventeen records. Each is an explicit A-vs-B comparison — the rejected option written out with its real advantages — plus the risks taken on, the hidden assumptions, and the **flip triggers** that would reverse it. See [decisions/README](decisions/README.md).

### [deferred/](deferred/) — specified, deliberately not built

Work that is designed and descoped. Being able to show what you chose _not_ to build is a form of rigour, not an admission.

---

## ID index

Every prefix, and the one document that owns it. Cite IDs; do not paraphrase them.

| Prefix                            | Means                                                       | Owner                                                                  |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `FR-0xx`…`FR-9xx`                 | Functional requirement, numbered by pipeline stage          | [02](01-foundation/02-requirements.md)                                 |
| `NFR-n`                           | Non-functional requirement                                  | [02](01-foundation/02-requirements.md)                                 |
| `S-n`                             | Product success criterion                                   | [01 §7.1](01-foundation/01-vision-and-scope.md)                        |
| `P-n`                             | Performance budget                                          | [01 §7.2](01-foundation/01-vision-and-scope.md)                        |
| `M1`…`M7` / `G1`…`G3` / `B1`…`B2` | The brief's own Must / Good-to-have / Bonus clauses         | [00 §3](01-foundation/00-problem-alignment.md)                         |
| `S1`…`S6`                         | Submission deliverable                                      | [00 §5](01-foundation/00-problem-alignment.md)                         |
| `TG-n`                            | Transition guard on the orchestrator FSM                    | [04 §3.3](02-architecture/04-system-architecture.md)                   |
| `I-n`                             | Data-model invariant, asserted in code                      | [05 §5](02-architecture/05-data-model.md)                              |
| `Vn`                              | Healing veto — a hard block                                 | [13](03-algorithms/13-triage-and-healing.md)                           |
| `EC-nn`                           | Golden eval case                                            | [16](04-build/16-agent-test-suite.md)                                  |
| `R-n`                             | Rehearsal                                                   | [16](04-build/16-agent-test-suite.md)                                  |
| `M-nn`                            | Injectable defect on the bundled target                     | [19](04-build/19-target-apps.md)                                       |
| `EXT-nn`                          | External validation platform — supplementary, non-canonical | [target-apps/external-platforms.md](target-apps/external-platforms.md) |
| `RK-nn`                           | Risk                                                        | [23](05-delivery/23-risk-register.md)                                  |
| `W-n`                             | Open work-plan item                                         | [00 · Work Plan §7](00-work-plan.md)                                   |
| `Q-n`                             | Open question about the event itself                        | [02 §13](01-foundation/02-requirements.md)                             |
| `ADR-nnn`                         | Decision record                                             | [decisions/](decisions/)                                               |
| `Ph0`…`Ph6`                       | Build phase                                                 | [20](05-delivery/20-execution-plan.md)                                 |
| `C1`…`C5`                         | Documentation checkpoint                                    | [00 · Work Plan §3](00-work-plan.md)                                   |

---

## Editing these documents

1. **[00 · Problem Alignment](01-foundation/00-problem-alignment.md) is the source of truth.** If a document disagrees with it, the document is wrong.
2. **[01 · Vision & Scope](01-foundation/01-vision-and-scope.md) is frozen** from Checkpoint C1. Changing it requires an ADR.
3. **IDs are permanent.** Never renumber, never delete, never reuse.
4. **A changed ID is a cross-document edit.** `grep -rn "FR-304" docs/` before you touch anything.
5. **`packages/core/src/schema` is frozen at the end of Ph1.** One Zod edit invalidates work in three places at once.
6. **New decisions get the next number** — `ADR-018` onward, following the template in [decisions/README](decisions/README.md).
7. **Docs and code change together.** A behaviour change with no doc edit fails review.
