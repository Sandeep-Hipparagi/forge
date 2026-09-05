# 20 · Execution Plan

> **Status:** Ready to implement from the docs-only `main` baseline. This is the implementation sequence for the prototype.
> **Audience:** Any engineer or AI coding agent starting from the repository root.
>
> The governing rule is simple: implement one phase, run its exit gate, then continue. Do not invent a replacement architecture while implementing a phase; the numbered specification documents are the source of truth.

## 1. Prototype outcome

The prototype accepts a target URL and optional login, explores it, builds a capability map, creates and critiques a test plan, generates Playwright tests, runs them, classifies failures, heals only when the veto rules permit it, verifies the complete flow, and reports the result.

The minimum successful path is:

```text
URL -> Explorer -> Planner -> Critic -> Generator -> Runner -> Triage -> Healer or Escalation -> Reporter
```

The first implementation target is bundled Aperture. SauceDemo and Conduit are compatibility targets, not reasons to duplicate the core pipeline.

## 2. Execution order

| Phase | Time | Implement | Exit gate | Cut only if behind |
|---|---:|---|---|---|
| `Ph0` Pre-flight | 15 min | Install dependencies, verify Node/pnpm, install the pinned browser, check the model key, run `pnpm verify` | Doctor and scaffold verification pass | Nothing; fix the environment |
| `Ph1` Spine | 60 min | Schemas, SQLite store, FSM, `runAgentLoop()`, REST/SSE shell, fixture harness | A stubbed session runs from start to finish | UI polish |
| `Ph2` Explorer | 90 min | Login detection, accessibility perception, frontier, state signatures, clustering, risk ranking | A real URL produces a capability map | Secondary evidence |
| `Ph3` Planner + Critic | 90 min | Lap packet, structured plan, deterministic fallback, coverage score, blocking rules, re-plan loop | `EC-03` rejects and re-plans a weak plan | Optional scenario breadth |
| `Ph4` Generator + Runner | 90 min | Deterministic compiler, locator ladder, live validation, evidence, full execution | `EC-01` generates and runs green | Trace and network summary |
| `Ph5` Triage + Healer | 75 min | Six-cause classifier, scoring, vetoes, patch, rollback, full-flow verification | `EC-05` heals; `EC-06` refuses | No safety rule |
| `Ph6` Reporter + UI | 90 min | Robustness score, report, dashboard, reset, demo path | `EC-07` passes and the demo runs twice | History and design-intelligence views |

## 3. Required implementation order

1. Read [01-foundation/00-problem-alignment.md](../01-foundation/00-problem-alignment.md), [01-foundation/02-requirements.md](../01-foundation/02-requirements.md), and the relevant ADRs.
2. Implement the schemas and invariants in [02-architecture/05-data-model.md](../02-architecture/05-data-model.md). Freeze them after `Ph1`.
3. Implement the deterministic kernel in `packages/core` before adding browser or model I/O.
4. Implement the real orchestrator against recorded transcripts and tool tapes. The fixture harness must not require a browser or API key.
5. Replace fixture seams with live Playwright and model adapters only after the corresponding golden case passes.
6. Keep every model call behind the call-site contract in [02-architecture/07-llm-integration.md](../02-architecture/07-llm-integration.md).

## 4. Definition of done

A phase is done only when its exit gate is executable, its focused tests pass, its output is persisted according to the data model, and the relevant requirement or decision references remain true. A feature that works only with a key, a live browser, or a particular machine is not complete.

The full agent test suite is [04-build/16-agent-test-suite.md](../04-build/16-agent-test-suite.md). The API contract is [04-build/17-api-spec.md](../04-build/17-api-spec.md). The target and mutation contract is [04-build/19-target-apps.md](../04-build/19-target-apps.md).

## 5. Scope-cut ladder

When time is lost, cut in this order: secondary UI routes, trace and network summaries, non-essential target applications, optional design checks, then additional scenario breadth. Never cut schemas, persistence, the Critic floor, vetoes, deterministic fallback, full-flow verification, or the refuse-to-heal case.

## 6. Verification commands

```bash
pnpm verify
pnpm doctor
pnpm test
pnpm forge eval
pnpm forge demo
```

The command names are normative only when implemented by [04-build/15-repo-and-conventions.md](../04-build/15-repo-and-conventions.md); keep the CLI help text aligned with this list.
