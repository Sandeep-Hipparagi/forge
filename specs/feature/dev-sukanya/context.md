# Feature Context: Phase 1 — Spine

## User Request

Implement only `Ph1` from `TASKLIST.md`, plan first, divide the phase into independently
verifiable tasks, preserve the existing Phase 0 baseline, and stop before `Ph2`.

## Repository State

- Branch: `feature/dev-sukanya`, created from `main` at `5d3758b`.
- Phase 0 source is present, but the active `node_modules` came from another branch.
- Baseline `pnpm verify` currently fails because `next` and `react` are not installed for the
  checked-out Phase 0 lockfile. `pnpm install --frozen-lockfile` is required before implementation.
- A prior local Phase 0 implementation is retained at `backup/ph0-sukanya`; it is not part of this
  branch and must not be merged.

## Authoritative Requirements

- `TASKLIST.md` § Ph1 — checkpoints `Ph1.1` through `Ph1.7`.
- `docs/02-architecture/05-data-model.md` — Zod entities, DDL, invariants, ID conventions.
- `docs/02-architecture/04-system-architecture.md` §3 — session/lap FSM and `TG-1`…`TG-11`.
- `docs/02-architecture/06-agent-contracts.md` §2 — bounded `runAgentLoop()`.
- `docs/04-build/17-api-spec.md` — REST/SSE surface, ordering, errors, loopback binding.
- `docs/04-build/16-agent-test-suite.md` §3, §6–§8 — replay seams, key derivation, cases,
  guard/invariant tests.
- `docs/05-delivery/21-resilience.md` — bounded retries and failure values.
- `docs/04-build/15-repo-and-conventions.md` — package boundaries and Definition of Done.

## Related Pull Requests

- [PR #1 — Docs/readiness contracts](https://github.com/bhagyarana/forge/pull/1) is open and
  proposes `FR-009`, `SessionConfigSnapshot`, correlated/versioned event fields, and `I-21`.
  These are not in current `main` or `TASKLIST.md`'s Phase 1 ownership. This implementation follows
  current `main`; the open PR is a schema-freeze integration risk that must be reconciled before
  merging either branch.
- [PR #2 — external testing-platform context](https://github.com/bhagyarana/forge/pull/2) is merged
  and contains the Phase 0 baseline used here.

## Applicable Engineering Constraints

- Node/pnpm versions and workspace boundaries remain those established in Phase 0.
- Core remains pure and imports no I/O, browser, persistence, model, or orchestrator package.
- Credentials are accepted at the API boundary but never enter stored `Session`, event, evidence,
  generated file, or log shapes.
- SQLite metadata and the content-addressed evidence filesystem are real in replay; they are not
  replaced by in-memory doubles.
- Every transition is persisted before publication.
- API behavior is local-first and loopback-bound as specified by the repository. Enterprise REST,
  security, logging, data-protection, database, AI-governance, and SDLC standards were reviewed;
  project-local constraints are stricter for credentials, append-only audit events, deterministic
  decisions, and model isolation.

## Required Skills

- `wex-eng-flow-dev` — resolved from the Foundry registry and followed from its remote `SKILL.md`.
- `wex-build-and-test` — selected for post-implementation checks; not installed in the local Cursor
  skill set, so its lint/build/test behavior will be executed directly through repository scripts.
- `wex-api-standards` — selected for API compliance; not installed locally, so the applicable
  contract and REST guardrail will be checked manually.

## Context Fetch Warnings

- No Jira key was supplied; `TASKLIST.md` and its linked specifications are the authoritative
  acceptance criteria.
- Raw registry URLs returned 404 because the repositories are private. The same pinned registry
  files and selected bodies were read through authenticated GitHub API endpoints.
- No LoB was identified; no LoB-specific context registry was loaded.

## Routing Audit Trail

- Policy version: `v1.4.2`
- Routing basis: `plan_then_build` (`enterprise-context` → `contracts` → `skills`)
- Skills registry:
  `https://api.github.com/repos/wex-gts/wex-foundry-skills/contents/_registry.json`
- Contracts registry:
  `https://api.github.com/repos/wex-gts/wex-foundry-specs/contents/_contracts.json`
- Enterprise-context registry:
  `https://api.github.com/repos/wex-gts/wex-foundry-context/contents/_context.json`
- Selected skill:
  `https://api.github.com/repos/wex-gts/wex-foundry-skills/contents/skills/development/wex-eng-flow-dev/SKILL.md`
- Selected contracts:
  `wex-engineering-standards.md`, `wex-security-compliance.md`, `wex-api-standards.md`,
  `wex-database-standards.md`, `wex-ai-governance.md`
- Selected enterprise guardrails:
  `rest-api-design-standard`, `application-logging-standard`, `data-protection`
