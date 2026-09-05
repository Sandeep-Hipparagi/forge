# Implementation Plan

## Delivery principle

Build the smallest vertical slice that proves decision quality. Do not build dashboard breadth, parallel workers, or secondary targets until the safety loop works end to end.

## Phase 1 — Foundation

Create the pnpm workspace, strict TypeScript configuration, Zod schemas, core pure functions, SQLite store, event envelope, and fixture harness.

**Gate:** a replayed stub session reaches a rendered report without a browser or model key.

## Phase 2 — Controlled target and exploration

Build Aperture, a deterministic authenticated shop with sign-in, cart, checkout, error states, and switchable mutations. Implement Playwright navigation, login, accessibility snapshot capture, state signatures, safe affordance discovery, capability clustering, and risk ranking.

**Gate:** an unknown base URL produces a persisted capability map with at least one meaningful high-risk flow.

## Phase 3 — Plan, critique, generate

Implement Planner structured output and deterministic templates. Add the Coverage Critic with blocking rules, a re-plan cap, and residual-gap recording. Compile plans to Playwright specs and validate selectors and assertions live.

**Gate:** a deliberately weak checkout plan is rejected, re-planned, compiled, and run successfully.

## Phase 4 — Triage and healing

Implement failure capture, deterministic diagnosis, vetoes, candidate ranking, test-file patching, rollback, and full-flow verification. Add two golden mutations: renamed/moved action button and incorrect checkout total.

**Gate:** the first mutation yields a persisted verified locator patch; the second creates a product defect report with no patch.

## Phase 5 — Judge experience

Implement the dashboard's run screen, event stream, coverage comparison, evidence viewer, healing decision card, and report view. Add Docker only after the local run is reliable.

**Gate:** the scripted demo runs twice from a clean reset in under five minutes.

## Test pyramid

| Tier | Purpose | Required examples |
|---|---|---|
| Unit | Pure score, policy, compiler, and report logic | coverage blocks; vetoes; locator ranking; score math |
| Golden replay | Real FSM over recorded agent/browser outputs | plan rejection; ambiguity; rollback |
| Browser integration | Reference target and mutation controls | explore; generate; execute; verified heal; refuse heal |
| Demo rehearsal | Entire product path | clean reset; cold start; offline fallback |

## Required quality commands

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm eval
pnpm demo:check
pnpm build
```

## Scope-cut order

Cut dashboard polish, network/trace visualisation, second and third targets, PRD/intent enrichment, and parallel workers—in that order. Never cut persistence, the Coverage Critic, healing vetoes, rollback, full-flow verification, or the refuse-to-heal demonstration.
