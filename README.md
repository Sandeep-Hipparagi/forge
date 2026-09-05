# FORGE

**Autonomous Test Orchestration Agent**

FORGE accepts a URL and optional login, explores the application, builds a capability map, creates and critiques a test plan, generates Playwright tests, runs them, classifies failures, heals only when the evidence permits it, and reports the result.

## Repository purpose

The `main` branch is the clean, documentation-first starting point for building the MVP from scratch. It intentionally contains no previous implementation, package manifests, generated output, or stale scaffold. The specification in [`docs/`](docs/README.md) is the source of truth.

This branch is **not executable yet**. There is deliberately no `package.json` or lockfile to install. Those files should be created during the first implementation phase from the contracts below, then committed on an implementation branch or in a follow-up change to `main`.

## What to read first

1. [Problem alignment](docs/01-foundation/00-problem-alignment.md) explains the brief, rubric, and non-negotiable claims.
2. [Vision and scope](docs/01-foundation/01-vision-and-scope.md) defines the product loop and boundaries.
3. [Requirements](docs/01-foundation/02-requirements.md) defines acceptance criteria and traceability.
4. [System architecture](docs/02-architecture/04-system-architecture.md) and [data model](docs/02-architecture/05-data-model.md) define the core contracts.
5. [Execution plan](docs/05-delivery/20-execution-plan.md) gives the implementation order and phase gates.
6. [Repository conventions](docs/04-build/15-repo-and-conventions.md) defines the future code layout and dependency rules.

The complete index is [`docs/README.md`](docs/README.md). Current documentation status is tracked in [`docs/00-work-plan.md`](docs/00-work-plan.md).

## Product loop

```text
Explore -> Prioritise -> Plan -> Critique -> Generate -> Run -> Triage -> Heal or Escalate -> Verify -> Report
```

The two defining behaviours are:

- **Critique before generation:** a weak plan is rejected and replanned before test code is written.
- **Veto-gated healing:** a failure is classified first; suspected product defects are reported, not silently repaired.

## Agreed technology stack

| Area | Choice | Purpose |
|---|---|---|
| Runtime | Node.js 22.11+ | Supported execution environment |
| Package manager | pnpm 10.12+ | Workspace management and reproducible installs |
| Language | TypeScript 5.9+ | Strict application and domain code |
| API | Fastify 5 | REST API, SSE events, and orchestration host |
| Web UI | Next.js 15, React | Mission Control dashboard |
| Browser automation | Playwright Test | Exploration, generation validation, execution, and evidence |
| Perception | Playwright accessibility snapshots | Deterministic page state and affordances |
| Domain validation | Zod | Runtime schemas and inferred TypeScript types |
| Persistence | SQLite via `better-sqlite3` | Sessions, laps, decisions, and historical evidence index |
| Evidence files | Content-addressed filesystem | Screenshots, traces, and generated suites |
| Model integration | Anthropic Messages API and SDK | Bounded structured-output model calls |
| Testing | Vitest plus Playwright Test | Pure unit, replay/golden, and live browser tests |
| Quality | ESLint, Prettier, dependency-cruiser, TypeScript | Formatting, linting, type safety, and import boundaries |
| Packaging | Docker Compose | Optional one-command local/demo deployment |
| CI | GitHub Actions | Install, typecheck, lint, unit, and golden checks |

The model is an adapter, not the source of truth. Deterministic code owns schemas, scoring, state transitions, compilation, safety vetoes, persistence, and reporting. The selected default model is documented in [LLM integration](docs/02-architecture/07-llm-integration.md); `FORGE_LLM_ENABLED=false` must support offline replay and evaluation.

## MVP implementation shape

The future implementation is a pnpm workspace with these intentional boundaries:

```text
apps/web       Next.js dashboard
apps/api       Fastify API, orchestrator host, and Playwright runtime
apps/sut       Bundled mutable Aperture target for controlled demonstrations
packages/core  Pure schemas, domain logic, scoring, compilation, and reports
packages/perception  Accessibility snapshots and state signatures
packages/agents      Bounded Explorer, Planner, Critic, and Triage loops
packages/orchestrator  Session/lap finite-state machine
packages/runner  Playwright execution and evidence capture
packages/store   SQLite metadata and evidence index
packages/evals   Recorded transcripts, tool tapes, and golden cases
packages/cli     The `forge` command
fixtures/       Tracked replay inputs and expected outputs
artifacts/      Runtime output only; never source
```

The detailed dependency graph and package responsibilities are in [Repository & conventions](docs/04-build/15-repo-and-conventions.md). Do not recreate the old singular `packages/agent` package or copy the removed scaffold.

## Day-one setup after implementation begins

Clone this branch and read the documents first:

```bash
git clone <repository-url>
cd qa-agent-research
```

Install these prerequisites before the first implementation commit:

- Git
- Node.js 22.11 or newer
- pnpm 10.12 or newer (`corepack enable` is recommended)
- Chromium installed by Playwright
- Docker Desktop, only if using the container path
- An Anthropic API key, only for live model runs; replay mode works without one

The implementation branch must then add the workspace manifests and run:

```bash
corepack enable
pnpm install
pnpm exec playwright install chromium
copy .env.example .env
pnpm verify
pnpm doctor
```

The commands are normative once implemented by the CLI and workspace described in the docs. The MVP phase order is [`20 · Execution Plan`](docs/05-delivery/20-execution-plan.md): build the pure spine and replay harness first, then connect Playwright and the model, then add the UI and Docker path.

## Main branch file policy

| Keep on documentation baseline | Move to an implementation branch or recreate later |
|---|---|
| `README.md`, all reviewed `docs/**/*.md`, and `.gitignore` | `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` |
| Requirements, architecture, algorithms, ADRs, runbook, and risks | `apps/**` and `packages/**` source and manifests |
| Problem statement and deferred design notes | `fixtures/**`, generated artifacts, databases, and build output |
| This README's technology and bootstrap contract | CI, TypeScript, ESLint, Prettier, Playwright, Docker, and environment config |

Keeping the implementation out of this baseline prevents an AI coding agent from treating incomplete scaffold code as an authority. The implementation branch should be created from this branch and should add files in the order defined by the execution plan.

## Status

Documentation is complete and ready to implement. No end-to-end application has been implemented on this baseline. See [the work plan](docs/00-work-plan.md) for the phase gates and [the agent test suite](docs/04-build/16-agent-test-suite.md) for the first executable contract to build.
