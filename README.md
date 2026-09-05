# FORGE

**Autonomous Test Orchestration Agent**

FORGE accepts a URL and optional login, explores the application, builds a capability map, creates and critiques a test plan, generates Playwright tests, runs them, classifies failures, heals only when the evidence permits it, and reports the result.

## Repository purpose

The specification in [`docs/`](docs/README.md) is the source of truth: every behaviour the code has to satisfy is written down there before it is implemented. `main` started as a documentation-only baseline and now also carries the implementation, built phase by phase against [`TASKLIST.md`](TASKLIST.md).

**Current status: `Ph0` (pre-flight) is complete.** The workspace installs, lints, typechecks, and `pnpm doctor` is green — see [Quickstart](#quickstart) below. No product behaviour exists yet; that starts at `Ph1`. See [Status](#status) and [`TASKLIST.md`](TASKLIST.md) for exactly what is and isn't built.

## Quickstart

Get a clean clone running in about five minutes.

**Prerequisites**

| Tool                           | Version                                                                 | Notes                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Git](https://git-scm.com/)    | any recent                                                              |                                                                                                                                                                    |
| [Node.js](https://nodejs.org/) | **22.11.0** (pinned in [`.nvmrc`](.nvmrc))                              | Use [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows) if your machine has a different Node installed |
| pnpm                           | **10.12.4** (pinned in [`package.json`](package.json) `packageManager`) | Installed via Corepack, not globally                                                                                                                               |
| Chromium                       | installed by Playwright                                                 | one command below, no separate download                                                                                                                            |
| Anthropic API key              | optional                                                                | only for live model runs — replay/deterministic mode works with none                                                                                               |

**Install and verify**

```bash
git clone <repository-url>
cd forge

# 1 · toolchain — skip the nvm lines if node -v already prints 22.11.0
nvm install        # reads .nvmrc
nvm use
corepack enable
corepack prepare pnpm@10.12.4 --activate

# 2 · dependencies
pnpm install
pnpm exec playwright install chromium --with-deps

# 3 · environment (no real values needed to pass doctor/verify)
cp .env.example .env      # Windows: copy .env.example .env

# 4 · prove the workspace is wired correctly
pnpm doctor    # toolchain, browser, safety-env checks — must exit 0
pnpm verify    # typecheck && lint && test && replay-tier eval — must exit 0
```

If `pnpm doctor` fails, it prints exactly which pin drifted (Node version, pnpm version, missing Chromium, or a widened safety env var) — fix that one thing and re-run.

**Run something**

```bash
pnpm dev          # web (:3000) + api (:4000) + sut (:4100), in parallel
pnpm dev:sut      # just the bundled target app, alone
```

There is no end-to-end product behaviour yet (that lands starting `Ph1`), so `pnpm dev` currently boots empty scaffolds — useful to confirm the toolchain works, not to see FORGE do anything.

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

| Area               | Choice                                           | Purpose                                                     |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| Runtime            | Node.js 22.11+                                   | Supported execution environment                             |
| Package manager    | pnpm 10.12+                                      | Workspace management and reproducible installs              |
| Language           | TypeScript 5.9+                                  | Strict application and domain code                          |
| API                | Fastify 5                                        | REST API, SSE events, and orchestration host                |
| Web UI             | Next.js 15, React                                | Mission Control dashboard                                   |
| Browser automation | Playwright Test                                  | Exploration, generation validation, execution, and evidence |
| Perception         | Playwright accessibility snapshots               | Deterministic page state and affordances                    |
| Domain validation  | Zod                                              | Runtime schemas and inferred TypeScript types               |
| Persistence        | SQLite via `better-sqlite3`                      | Sessions, laps, decisions, and historical evidence index    |
| Evidence files     | Content-addressed filesystem                     | Screenshots, traces, and generated suites                   |
| Model integration  | Anthropic Messages API and SDK                   | Bounded structured-output model calls                       |
| Testing            | Vitest plus Playwright Test                      | Pure unit, replay/golden, and live browser tests            |
| Quality            | ESLint, Prettier, dependency-cruiser, TypeScript | Formatting, linting, type safety, and import boundaries     |
| Packaging          | Docker Compose                                   | Optional one-command local/demo deployment                  |
| CI                 | GitHub Actions                                   | Install, typecheck, lint, unit, and golden checks           |

The model is an adapter, not the source of truth. Deterministic code owns schemas, scoring, state transitions, compilation, safety vetoes, persistence, and reporting. The selected default model is documented in [LLM integration](docs/02-architecture/07-llm-integration.md); `FORGE_LLM_ENABLED=false` must support offline replay and evaluation.

## MVP implementation shape

The implementation is a pnpm workspace with these intentional boundaries:

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

See [Quickstart](#quickstart) above for the tested install steps. The MVP phase order is [`20 · Execution Plan`](docs/05-delivery/20-execution-plan.md) and [`TASKLIST.md`](TASKLIST.md): the pure spine and replay harness first (`Ph1`), then Playwright and the model (`Ph2`–`Ph5`), then the UI and Docker path (`Ph6`).

## Status

Documentation is complete. `Ph0` (pre-flight) is complete: the pnpm workspace, dependency-cruiser/ESLint/Prettier guardrails, CI, git hooks, pinned Chromium, and `forge doctor` all exist and pass — `pnpm lint`, `pnpm verify`, and `pnpm doctor` are green. No product behaviour exists yet; that starts at `Ph1` (schemas, store, FSM, `runAgentLoop()`, API/SSE, eval harness). See [`TASKLIST.md`](TASKLIST.md) for the full checkpoint-by-checkpoint state, [the work plan](docs/00-work-plan.md) for the documentation history, and [the agent test suite](docs/04-build/16-agent-test-suite.md) for the executable contract `Ph1` builds against.
