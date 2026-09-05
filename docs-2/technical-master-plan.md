# Technical Master Plan & Codebase Gap Review

> **Version:** 1.1.0
> **Target:** Bessemer Tech Catalyst — September 2026
> **Scope:** Low-level planning only; no runtime implementation is claimed by this document.

## 1. Product thesis

The QA penalty phase happens when a quickly shipped feature needs days of manual test authoring, stabilisation, and failure interpretation. AIVAR Sentinel QA accepts a target URL and conditional credentials, then autonomously explores, plans, evaluates coverage, generates Playwright tests, executes them, triages failures, heals eligible locator drift, and synthesises evidence.

The differentiation is the meta-orchestrator: it decides what to test, blocks weak plans before code generation, and distinguishes product defects from broken tests.

## 2. State machine and observability

```text
INITIALIZE → AUTHENTICATING? → EXPLORE → PLAN → EVALUATE_COVERAGE ── score < 0.85 ──► targeted re-plan
      │                     │                                  (maximum two rounds)
      │                     └─ score ≥ 0.85
      ▼
GENERATE_TESTS → EXECUTE_SUITE → TRIAGE_FAILURE
                                     ├─ locator drift → HEAL_LOCATOR → VERIFY_PATCH
                                     └─ app defect   → PRESERVE_DEFECT
                                                   │
                                           SYNTHESIZE_REPORT → COMPLETE / COMPLETE_WITH_DEFECTS
```

The orchestrator owns all transitions. Each transition creates an immutable event, a persisted state snapshot, and an OpenTelemetry span with redacted identifiers, duration, budget balance, decision, and evidence references. Agents receive typed packets, return typed proposals, and cannot write state or invoke other agents directly.

| Storage | Local/demo | Production path | Rule |
|---|---|---|---|
| Session, plans, diagnoses | SQLite | Postgres | append-only audit rows |
| Coordination/checkpoints | in-process | Redis | cache only, never evidence authority |
| Screenshots, traces, HAR, specs | content-addressed filesystem | encrypted object store | tenant TTL and access policy |
| Credentials | process memory | secret-provider reference | redact, never persist in events |

## 3. Planner Agent

The Planner runs in an ephemeral Chromium context. It detects login forms from accessible labels, retrieves credentials through an injected secret provider, and limits navigation to the target origin plus an explicit allow-list. AWS Secrets Manager is a production adapter; it is not a requirement for local development.

Exploration uses bounded breadth-first traversal over state signatures built from route, title, landmarks, visible form labels, and safe affordances. It extracts buttons, links, inputs, modal controls, and ARIA landmarks. Delete, purchase, external navigation, account removal, and destructive submit actions are deny-listed unless a disposable target profile permits them.

```ts
type ExplorationPlan = {
  routePath: string;
  authRequired: boolean;
  interactiveElements: Array<{
    elementId: string;
    tag: string;
    visibleText?: string;
    role?: string;
    locator: LocatorFingerprint;
  }>;
  scenarios: Array<{
    id: string;
    flowType: "happy_path" | "boundary" | "negative" | "error_state";
    steps: PlannedStep[];
  }>;
};
```

## 4. Coverage Evaluation Gate

```text
coverage = 0.35 × routeCoverage
         + 0.30 × actionCoverage
         + 0.20 × edgeCoverage
         + 0.15 × negativeCoverage
```

`routeCoverage` measures discovered in-origin capabilities represented by scenarios. `actionCoverage` measures observed safe click/form affordances represented by a scenario. `edgeCoverage` measures observable empty, boundary, and constraint checks. `negativeCoverage` measures invalid-input, authorization, and error-state coverage.

At `0.85` or above, generation proceeds. Below `0.85`, the Critic emits specific missing branches and invokes targeted re-exploration/planning. After two rounds, the orchestrator records accepted risk only where no deterministic blocker remains; otherwise it ends `PARTIAL` with named gaps. Unreached capabilities score zero and the report must include the halt reason.

Optional PRD ingestion maps requirement IDs to scenarios, evidence, or explicit gaps. Markdown is parsed locally; PDF extraction must be sandboxed. Semantic/vector matching is augmentation, never the only traceability mechanism.

## 5. Generator Agent

The Generator compiles approved structured scenarios to TypeScript Playwright specs. It uses Playwright auto-waiting and reactive assertions (`toBeVisible`, `toHaveURL`, `toHaveText`); `page.waitForTimeout()` is banned in generated files and linted in CI.

Locator order is: `data-testid`/`data-qa`, accessible role and name, associated label, normalised scoped semantic text, then ancestry-scoped CSS. Each emitted locator carries a fingerprint and resilience score. A clean browser context validates selectors and assertions before a spec is accepted.

## 6. Healer and defect classifier

Triage examines assertion differences, HTTP status, console exceptions, network evidence, current accessibility state, retry history, and locator resolution. It returns one of `LOCATOR_DRIFT`, `ASSERTION_DRIFT`, `PRODUCT_DEFECT`, `ENVIRONMENT`, `FLAKY_INTERACTION`, or `AMBIGUOUS`.

5xx responses, client runtime errors, changed expected values, failed business assertions, and state mismatch preserve failure evidence and veto healing.

### Layer 1 — structural match

Compare the original element's compact DOM/accessibility subtree to candidates by tag/role, stable attributes, ancestry, siblings, and accessible name. A normalised tree-edit similarity of at least `0.90`, exactly one resolved candidate, and no veto allow local repair. The pure scoring target is under 50 ms; browser capture latency is measured separately.

### Layer 2 — visual fallback

Below `0.90`, a redacted screenshot, candidate bounding boxes, and original semantic intent may be sent to a multimodal adapter. The adapter must return a DOM-backed candidate and confidence—not raw generated selector text. This fallback is disabled for sensitive targets unless explicitly enabled and follows screenshot retention policy.

Patch TypeScript through an AST, changing only one locator expression. Verify the failed step and then the whole scenario. Failed verification restores the original file and writes a rollback event. Repository mode creates a signed patch branch or pull request only with explicit authority; it never silently commits to a shared branch.

## 7. Indic-language voice hook

The optional Sarvam-compatible voice adapter synthesises Hindi, Tamil, Kannada, and code-mixed test utterances for test voice-bot tenants only. It transcribes responses, validates intent/state-machine transitions, and reports per-locale p95 round-trip latency and word-error rate. Default gates are p95 `< 500 ms` and WER `< 15%`; both are configurable by locale. No production conversation recording or unredacted PII is retained.

## 8. Codebase gap audit

| Area | Required evidence | Baseline status | Required implementation |
|---|---|---|---|
| Architecture | orchestrator, agents, runner, dashboard, core boundaries | Planned only | scaffold workspace and dependency rules |
| Contracts | Zod-validated agent proposals | Planned only | implement schemas before adapters |
| Playwright | semantic locator ladder; no sleeps | Planned only | lint ban and generator golden tests |
| Healing | structural scorer plus bounded visual fallback | Planned only | local scorer first; VLM opt-in |
| Patch safety | AST patch, rollback, full-flow verification | Planned only | mutation golden tests |
| Telemetry | JSON logs, OTLP spans, SSE dashboard stream | Planned only | exporter and event viewer |
| Secrets | redaction and secret-provider boundary | Planned only | log scrubber and credential adapter |
| Voice QA | locale adapters and threshold report | Deferred bonus | build after core loop is stable |

No application code exists on this documentation branch. Therefore all implementation rows remain unverified.

## 9. Build order

1. schemas, state machine, persistence, replay fixtures, report;
2. mutable reference target, browser exploration, coverage gate;
3. generator, execution evidence, triage;
4. structural healer, AST patch, verification, rollback;
5. dashboard and repeatable demo;
6. visual fallback, PRD semantic matching, parallel workers, and voice hook.

This order delivers the winning safety and orchestration claim before optional integrations consume the schedule.
