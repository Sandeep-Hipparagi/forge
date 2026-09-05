# Product Specification

## 1. Outcome

AIVAR Sentinel QA is an autonomous QA orchestration service for web applications. Its purpose is to turn a URL into a verified Playwright suite and an honest quality report, while preserving the distinction between a broken test and a broken product.

## 2. In scope

| Capability | Acceptance criterion |
|---|---|
| Autonomous intake | A run begins from a URL, and optional credentials where authentication is required. |
| Exploration | The Explorer builds a deduplicated capability/state map from safe browser interaction and accessibility snapshots. |
| Planning | The Planner produces readable scenarios across happy path, negative, boundary, and error-state classes. |
| Coverage critique | The Critic identifies gaps and blocks generation until the plan meets a configured structural floor or records accepted risk. |
| Generation | The Generator writes TypeScript Playwright specs using a semantic locator ladder and validates selectors live. |
| Execution | The Runner captures result, trace, screenshot, console, and locator evidence. |
| Triage | Every failed step is classified as locator drift, assertion drift, product defect, environment issue, flaky interaction, or ambiguous. |
| Healing | Only high-confidence locator drift may produce a persisted patch; it must pass step and full-flow verification. |
| Reporting | The report includes covered scenarios, outcomes, healing decisions, defects, gaps, and ranked untested flow risk. |
| Indic voice hook | An optional, isolated adapter validates voice-agent state transitions, transcript intent, latency, and regional-language quality. |

## 3. Explicit non-goals

- Production-scale multi-tenant hosting, CI integration, and cross-browser matrices.
- Claiming complete coverage of an unknown application.
- Automatically changing assertions, expected business values, or product behavior.
- Silent source-control commits to shared branches. Repository mode prepares a signed patch or pull request only with explicit authority.
- Performing destructive product actions unless the target is explicitly marked disposable.

## 4. Quality rules

1. **No blind healing.** A repair changes a locator only; assertion or product evidence triggers a veto.
2. **No hidden uncertainty.** Budget exhaustion, incomplete exploration, and ambiguous diagnoses are first-class report outcomes.
3. **No model authority.** LLM responses are typed proposals. Deterministic code owns validation, budgets, state transitions, patching, and reporting.
4. **No unverified patch.** A patch is retained only after the failed step and its whole flow pass.
5. **No vanity coverage.** Coverage is scored against the discovered backlog, with unreached capabilities contributing zero.
6. **No unsafe voice action.** Voice evaluation uses synthetic audio and test tenants only; customer recordings are never ingested.

## 5. Scorecard

| Dimension | Measure |
|---|---|
| Functional completeness | URL-to-report pipeline completes against the reference target. |
| Coverage quality | Critic score, all scenario classes, and named residual gaps. |
| Determinism | Replay fixtures reproduce orchestration results without browser or LLM access. |
| Resilience | Locator strategies and verified successful healing rate. |
| Integrity | Escalations, dropped scenarios, accepted risk, and rolled-back patches. |

The final score measures test-suite trustworthiness, never product quality. Finding a real defect is a successful outcome.
