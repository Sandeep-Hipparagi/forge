# 23 · Risk Register

> `RK-nn` identifies a delivery risk. `R-n` identifies a rehearsal. The prototype floor is never traded away to make a date.

## 1. Active risks

| ID | Risk and trigger | Mitigation | Response |
|---|---|---|---|
| `RK-01` | Browser or font drift changes screenshots or state signatures | Pin Playwright/browser, self-host fonts, freeze viewport and clock | Use the designated machine and record the revision |
| `RK-02` | Target is unreachable or organiser URL changes | Keep Aperture local; rehearse a cold switch to SauceDemo/Conduit | Run the isolated fallback target |
| `RK-03` | Model output is invalid, slow, unavailable, or over budget | Structured parsing, bounded retries, cached plans, deterministic mode | Continue labelled deterministic path or escalate |
| `RK-04` | Critic accepts an incomplete plan | Arithmetic score, blocking rules, `EC-03`, re-plan cap | Stop the lap and report the coverage gap |
| `RK-05` | Healer changes the wrong element or masks a product defect | Locator ladder, resolved-count filter, vetoes `V1`-`V5`, full-flow verification | Roll back and emit an escalation card |
| `RK-06` | Persistence or event ordering loses resumability | SQLite invariants, write-before-emit, restart rehearsal | Stop emission and resume from the last valid event |
| `RK-07` | Demo state is contaminated by an earlier mutation or heal | `forge reset`, clean fixture, reset before every rehearsal | Abort and reset; never repair state by hand |
| `RK-08` | UI hides uncertainty or makes decisions hard to inspect | Always show source, score, vetoes, evidence, and halt reason | Use the report and evidence artifacts |
| `RK-09` | Scope expands beyond the time budget | Use the ladder in [21 · Resilience](21-resilience.md) | Cut optional breadth, never safety or the loop |

## 2. Non-negotiable floor

The shipped prototype must retain: URL-to-report orchestration, one real target, persisted evidence, the Critic floor, deterministic fallback, healing vetoes, rollback, full-flow verification, the refuse-to-heal case, and a readable report. UI polish, extra targets, trace/network evidence, and optional design checks may be cut.

## 3. Review cadence

Review this table at the start of each execution phase and after every failed exit gate. A risk is closed only by the executable check named in its mitigation, not by a verbal status update.

## 4. Related evidence

The golden cases and rehearsals are defined in [04-build/16-agent-test-suite.md](../04-build/16-agent-test-suite.md). Deployment constraints are in [ADR-015](../decisions/ADR-015-deployment.md), perception transport in [ADR-016](../decisions/ADR-016-perception-transport.md), and arithmetic blocking in [ADR-017](../decisions/ADR-017-arithmetic-blocks.md).
