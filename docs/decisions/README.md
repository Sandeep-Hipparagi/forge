# Decisions

Seventeen architectural decision records. Each is an explicit **A-vs-B comparison** — the rejected option written out with its real advantages, not strawmanned — followed by the risks taken on, the **hidden assumptions** the decision rests on, and the **flip triggers** that would reverse it.

> A decision without a stated alternative is a preference. A decision without a flip trigger is a belief.

Records `001`–`010` are dated **26 Aug 2026**, written against an assumed problem. Records `011`–`017` are dated **4 Sep 2026**, the day the real problem statement arrived. Where the two sets disagree, the later set wins and says so in the earlier record's status line — nothing is quietly rewritten.

---

## The seventeen

### The re-aim — 4 Sep 2026

| # | Decision | Rejected alternative | Chosen |
|---|---|---|---|
| [011](ADR-011-agent-topology.md) | **A deterministic meta-agent over agentic sub-agents** | An LLM supervisor with handoffs; or full determinism | Agency where the world is unknown, determinism where the answer will be audited |
| [012](ADR-012-capability-lap.md) | **The Capability Lap is the unit of work** | Stage-major batch processing | One capability carried to a verified result before the next begins |
| [013](ADR-013-design-intelligence-deferred.md) | **Design intelligence is deferred, not deleted** | Keeping the pillar | ~2 h reclaimed for the Critic, which the rubric actually scores |
| [014](ADR-014-plain-vocabulary.md) | **Use the brief's vocabulary, not our mythology** | Argus / Daedalus / Hephaestus with a legend | Explorer, Planner, Critic, Generator, Runner, Triage, Healer, Reporter |
| [015](ADR-015-deployment.md) | **Local-first, with one-command containers for judges** | Vercel + Fly.io | `pnpm dev`, `pnpm forge demo`, `docker compose up` — and CI runs the third |
| [016](ADR-016-perception-transport.md) | **Call Playwright directly; do not run the MCP server** | `@playwright/mcp` as a subprocess | One browser stack. We need Playwright in-process anyway; MCP would add a second for one stage |
| [017](ADR-017-arithmetic-blocks.md) | **Only arithmetic may block the pipeline** | Let the model's coverage gaps carry `BLOCKER` severity | Model gaps are clamped to `MAJOR`; `TG-5b` stays reproducible and works with the key unset |

### The foundations — 26 Aug 2026

| # | Decision | Rejected alternative | Status |
|---|---|---|---|
| [001](ADR-001-veto-gated-healing.md) | **Healing is veto-gated, not confidence-gated** | One calibrated threshold | Accepted — **the thesis** |
| [002](ADR-002-llm-role.md) | **The LLM decides over evidence; it does not drive the browser** | An autonomous agent loop with browser tools | Accepted, refined by [011](ADR-011-agent-topology.md) |
| [003](ADR-003-design-contract-source.md) | Design intent comes from a hand-authored contract | Live Figma API | **Superseded by [013](ADR-013-design-intelligence-deferred.md)** |
| [004](ADR-004-locator-scoring.md) | **Locator scoring is deterministic arithmetic** | Embeddings or an LLM judge | Accepted |
| [005](ADR-005-persistence.md) | **SQLite for state, content-addressed FS for evidence** | JSON files on disk | Accepted |
| [006](ADR-006-spec-as-source-of-truth.md) | **The plan is the truth; `.spec.ts` is a projection** | Patch the generated TypeScript via AST | Accepted |
| [007](ADR-007-demo-app.md) | **Build our own deterministic target** | Only a public sandbox | Accepted, broadened by [19](../04-build/19-target-apps.md) |
| [008](ADR-008-orchestration-topology.md) | **One orchestrator FSM; limits are counters, not instructions** | Four autonomous agents on a bus | **Amended by [011](ADR-011-agent-topology.md)** |
| [009](ADR-009-frontend-transport.md) | **SSE for run progress** | WebSockets | Accepted |
| [010](ADR-010-post-heal-verification.md) | **A heal is not accepted until the whole flow re-runs** | Re-run the healed step only | Accepted, extended with rollback (`FR-710`) |

---

## How they hang together

Two arguments, one system.

**The safety argument** — why a healer is allowed to say no:

```
ADR-001  refuse when healing is illegitimate          ← the thesis
   ├── ADR-017  the same rule for the Critic: only arithmetic may block
   ├── ADR-004  make the score it overrides legible arithmetic
   ├── ADR-002  keep the model out of the safety path entirely
   ├── ADR-010  don't call it healed until the whole flow proves it
   └── ADR-006  patch the plan, not the generated code
```

**The autonomy argument** — why it can start from nothing but a URL:

```
ADR-011  agency where the world is unknown             ← the enabler
   ├── ADR-012  bound that agency to one capability at a time
   ├── ADR-008  keep every limit a counter, not a prompt instruction
   └── ADR-005  persist before emitting, so any moment is resumable
```

The two meet at [ADR-002](ADR-002-llm-role.md): the model may explore freely and judge freely, and may never execute, drive or decide inside the safety path.

### One theme, stated once

Ten of the seventeen trade capability for determinism. Repeating a trade ten times is how a system acquires a *shape* rather than a set of features. The shape here:

> **Put the decision in code, and let the model make the decision better rather than make it.**

It is also the shape's cost, concentrated in one place: **FORGE cannot improvise inside a verdict.** A defect or a flow outside what the contracts anticipate produces an escalation, not a workaround. [ADR-011](ADR-011-agent-topology.md) buys back exactly as much improvisation as exploration requires and not one stage more — and every ADR that trades this way names the same flip trigger from its own angle: the moment the bounded design starts *escalating on cases a human finds obvious*, the trade has stopped paying.

---

## Assumptions worth acting on before the build

A hidden assumption that stays inside one document is still hidden. These are the ones cheap to fix now and expensive to fix later.

| From | Gap | Fix | Phase |
|---|---|---|---|
| [011](ADR-011-agent-topology.md) A1 | Accessibility snapshots may be insufficient on canvas-heavy or custom-widget apps | Run the Explorer against one such target and record what it misses | Ph2 |
| [011](ADR-011-agent-topology.md) A3 | Nothing counts **schema-repair retries** — the earliest signal that structured output is unreliable | Instrument the repair-retry count from the first model call | Ph1 |
| [012](ADR-012-capability-lap.md) A1 | Flows that span capabilities (sign-up → onboarding → purchase) break lap independence | Exercise `dependsOn` on one target | Ph3 |
| [012](ADR-012-capability-lap.md) A3 | If risk-ordering is noisy, "the first lap is the most valuable" stops being true | Assert ordering determinism in the eval suite | Ph1 |
| [001](ADR-001-veto-gated-healing.md) A1 | Nothing logs a **patch a human later reverted** — the only real-world signal of a false heal | A `patch.reverted` event. The cheapest early warning in the project | Ph5 |
| [005](ADR-005-persistence.md) A1 | `better-sqlite3` is a native module and may not build on a fresh machine | Pre-flight check, hour zero — not hour six | Ph0 |
| [005](ADR-005-persistence.md) A4 | A 12-hex evidence prefix collision would serve the **wrong evidence** for a cited id | `putEvidence()` compares the full hash on a prefix hit | Ph1 |
| [008](ADR-008-orchestration-topology.md) A3 | Restart-resume is covered only by a manual drill. One `emit`-before-`write` breaks it silently | Automate the drill alongside the invariant tests | Ph1 |
| [010](ADR-010-post-heal-verification.md) A3 | A full-flow pass does not prove the healed locator found the *right* element | Post-heal fingerprint-similarity gate; the machinery already exists | Ph5 |
| [015](ADR-015-deployment.md) A1 | The organiser's URL may be unreachable from the venue network | Rehearsal `R-3` — a cold target switch | Ph6 |
| [016](ADR-016-perception-transport.md) A1 | A Playwright patch upgrade could change a state signature for an unchanged page | Pin the browser revision in `doctor`; assert a fixed signature against a stored fixture | Ph1 |
| [016](ADR-016-perception-transport.md) A2 | Snapshot-format tuning could cost far more than the 60–90 min budgeted | Timebox it. Past one hour, copy `@playwright/mcp`'s format verbatim | Ph2 |
| [017](ADR-017-arithmetic-blocks.md) A1 | The eight blocking rules may miss a class of bad plan we have not imagined | Record which half minted each blocker; a recurring `MAJOR` is the signal to promote it to a rule | Ph3 |
| [017](ADR-017-arithmetic-blocks.md) A3 | The severity clamp is one line that a well-meant later edit could remove | One test: a model gap arriving as `BLOCKER` is stored as `MAJOR` | Ph3 |

---

## Writing the eighteenth

Copy the shape, not just the headings. An ADR earns its place only if the rejected option is written well enough that a reader could choose it.

```markdown
# ADR-0NN · <the decision, as a claim in one line>

| | |
|---|---|
| **Status** | Proposed / Accepted / Superseded by … / Amended by … |
| **Decided** | <date> |
| **Deciders** | <who> |
| **Requirements** | <FR / NFR ids> |
| **Governs** | <the documents this constrains> |
| **Related** | <other ADRs> |

## 1. Context
What forced a choice. State the tension, not the answer.

## 2. The N options
Each with a **"its real advantages, stated fairly"** paragraph, then one comparison
table whose criteria are the things we actually care about — not a feature checklist.

## 3. Decision
What we chose, and the reasons in ascending order of importance.

## 4. Consequences
### Accepted costs — what this makes worse, named plainly
### Risks taken on — with mitigations
### Hidden assumptions — A1, A2, … each with how it would be falsified

## 5. Flip triggers
The observable conditions under which we would reverse this. If you cannot
name one, you have written a belief, not a decision.
```
