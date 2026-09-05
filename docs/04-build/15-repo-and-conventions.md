# 15 · Repo & Conventions

> **Renumbered and revised from the pre-brief `10-repo-and-conventions`.** That document was a contract between five people working in parallel for ten days. This one is a contract between whoever is at the keyboard and the version of themselves at hour six, when the interesting decisions are behind them and the expensive mistakes are ahead.
> **This document owns:** the package layout, the enforced import graph, the TypeScript and naming rules, the determinism chokepoints, the `forge` CLI surface, the git workflow, the machine-owned-path guard, and the Definition of Done.
> **The one rule everything else serves:** `pnpm verify` is the only gate, and it is green before anything is called finished.

---

## 1. What changed, and why the framing is different

| | Pre-brief edition | This edition |
|---|---|---|
| Time budget | Ten days | **6–8 hours, one sitting** ([00 §4](../00-work-plan.md)) |
| Team | Five people in parallel | One to three, collapsing cleanly to one (`W-3`) |
| Unit of work | `T-###` task from a 335-line backlog | **Phase `Ph0`…`Ph6`**, each with an exit gate ([20 · Execution Plan](../05-delivery/20-execution-plan.md)) |
| Packages | `core / runner / agent / store / evals / cli` | The same, split by the topology the re-aim produced: `agents/*`, `perception`, `orchestrator` |
| The SUT | *The* application under test | **One of three targets** ([19 · Target Applications](19-target-apps.md)) |
| Guardrail budget | ~40 minutes on D-10 | **15 minutes in `Ph0`**, because most of them already exist on disk |

The convention set below is deliberately *smaller* than the pre-brief one. Every rule that is not load-bearing on an eight-hour clock has been cut, and the ones that remain are here because breaking them costs more than an hour to discover.

---

## 2. Repository layout

```
forge/
├── .nvmrc                          22.11.0
├── pnpm-workspace.yaml
├── package.json                    root scripts only — no runtime dependencies
├── tsconfig.base.json              strict settings, extended by every package
├── .dependency-cruiser.cjs         the import graph, enforced (§2.2)
├── vitest.config.ts                unit + contract tiers
├── playwright.config.ts            pinned viewport, timeouts, trace, reporters
├── docker-compose.yml              api + web + bundled target — ADR-015
├── .env.example                    every variable, documented, no secrets
│
├── apps/
│   ├── web/                        Next.js 15 · the dashboard · :3000        18
│   ├── api/                        Fastify 5 · REST + SSE · :4000            17
│   │                               hosts the orchestrator and Playwright
│   └── sut/                        Aperture · the bundled mutable target     19
│       ├── src/
│       ├── state/                  seed.json · mutations.json · mutations.log  (gitignored)
│       └── views/
│
├── packages/
│   ├── core/                       PURE DOMAIN. Zero I/O. No browser, no model, no clock.
│   │   ├── schema/                 Zod schemas → inferred types — the single source of truth   05
│   │   ├── critic/                 structuralScore · classGaps · the verdict function          11
│   │   ├── compile/                TestPlan → .spec.ts · the deterministic compiler            12
│   │   ├── diagnose/               preClassify — the ten-row pre-classifier                    13
│   │   ├── healing/                candidates · six-signal scoring · vetoes · patch            13
│   │   ├── report/                 buildReport · the Robustness Score arithmetic               14
│   │   └── env.ts                  Clock · Rng · IdGen — the three determinism chokepoints
│   ├── perception/                 snapshots · state signatures · affordances · deny-list      08
│   ├── agents/                     BOUNDED MODEL LOOPS — one directory per open-world stage
│   │   ├── harness/                runAgentLoop() — the one place a loop is written            06
│   │   ├── explorer/               call site 1                                                 09
│   │   ├── planner/                call site 2                                                 10
│   │   ├── critic/                 call site 3 — the semantic half only                        11
│   │   └── triage/                 call sites 4 and 5                                          13
│   ├── runner/                     Playwright execution · evidence · fingerprints              12
│   ├── orchestrator/               the FSM, the guards TG-1…TG-11, the lap scheduler           04
│   ├── store/                      SQLite + content-addressed evidence filesystem              05
│   ├── evals/                      the fixture harness and golden cases EC-01…EC-07            16
│   └── cli/                        the `forge` command                                         §6
│
├── fixtures/                       TRACKED. The harness's inputs — 16 §3
│   ├── perception/                 recorded accessibility snapshots + DOM facts
│   ├── transcripts/                recorded model exchanges, per agent, per case
│   ├── tapes/                      recorded ToolResult tapes, per case
│   ├── plans/                      canonical TestPlan JSON
│   └── golden/                     EC-01…EC-07 case definitions and expected verdicts
│
├── artifacts/                      GITIGNORED. runs, evidence, generated suites, forge.db
└── docs/                           this documentation set
```

Three things about that tree are decisions rather than habits.

**`packages/core` has six subdirectories and no dependencies.** Everything that reaches a verdict — the coverage score, the pre-classifier, the six-signal scorer, the vetoes, the compiler, the report arithmetic — lives there. That is what makes `NFR-2` (works with no model) and `NFR-1` (same seed, same verdicts) properties of the build rather than promises in a README.

**`fixtures/` is tracked and `artifacts/` is not.** Fixtures are inputs to tests and therefore source. Artifacts are outputs of runs and therefore disposable. The line between them is the line between "this must be identical on your machine and mine" and "this must be deletable in under twenty seconds" (`NFR-9`).

**`apps/sut/` is a target, not the target.** It survives the re-aim for exactly one reason: proving *refusal to heal* requires a defect we control, and you cannot inject a defect into somebody else's demo site ([19 §1](19-target-apps.md)).

### 2.1 The dependency rule

```
apps/web        → apps/api            (HTTP only — never an import)
apps/api        → orchestrator
orchestrator    → { agents/*, core, perception, runner, store }
agents/*        → { core, perception }         never store, never runner
runner          → { core, perception }
perception      → core
core            → nothing
apps/sut        → nothing of ours
```

Two arrows that are absent carry more weight than the ones that are present.

**`agents/* ↛ store`** is the audit rule. A sub-agent that can write to the event log can rewrite the history the audit story depends on. Sub-agents return values; the orchestrator persists them ([06 §2.3](../02-architecture/06-agent-contracts.md)).

**`apps/sut ↛ packages/*`** is the credibility rule. The moment the application under test can import FORGE's code, a judge is entitled to ask whether the demo is staged. A build-enforced wall means the honest answer is *"it can't — the build fails."*

And one that is present but constrained: **`core ↛ everything`** is the velocity rule. It is what lets the healing scorer, the structural critic and the compiler ship with ~90 unit tests that run in under a second, in `Ph1`, before a browser layer exists.

### 2.2 The graph is enforced, not suggested

`.dependency-cruiser.cjs` — run by `pnpm lint`, in CI, on every push:

```js
module.exports = {
  forbidden: [
    { name: "core-is-pure",
      severity: "error",
      comment: "core must stay I/O-free so every verdict is testable without a browser",
      from: { path: "^packages/core" },
      to:   { path: "^(packages/|@forge/)(runner|store|agents|perception|orchestrator|cli)" } },

    { name: "no-node-builtins-in-core",
      severity: "error",
      comment: "core must not reach the filesystem, the network or a subprocess",
      from: { path: "^packages/core" },
      to:   { dependencyTypes: ["core"],
              path: "^(node:)?(fs|path|child_process|http|https|net|crypto)$" } },

    { name: "agents-cannot-persist",
      severity: "error",
      comment: "a sub-agent that can write the event log can rewrite history — 06 §2.3",
      from: { path: "^packages/agents" },
      to:   { path: "^(packages/|@forge/)(store|runner|orchestrator)" } },

    { name: "one-model-client",
      severity: "error",
      comment: "only the loop harness talks to the model — 06 §2",
      from: { pathNot: "^packages/agents/harness" },
      to:   { dependencyTypes: ["npm"], path: "^@anthropic-ai/" } },

    { name: "web-talks-http-only",
      severity: "error",
      comment: "the dashboard renders; it never imports the orchestrator",
      from: { path: "^apps/web" },
      to:   { path: "^(packages/|@forge/)(agents|orchestrator|runner|store|perception)" } },

    { name: "sut-is-isolated",
      severity: "error",
      comment: "the system under test must not know FORGE exists",
      from: { path: "^apps/sut" },
      // Both forms: a relative reach into packages/, and a bare `@forge/*`
      // specifier, which is unresolvable from apps/sut and would otherwise
      // produce a tsc error in the wrong place at the wrong time.
      to:   { path: "^(packages/|@forge/)" } },

    { name: "no-unresolvable",
      severity: "error",
      from: { pathNot: "([.]test[.]ts|next-env[.]d[.]ts)$" },
      to:   { couldNotResolve: true } },

    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
};
```

`one-model-client` is new since the re-aim and it is the rule that keeps [06 §2](../02-architecture/06-agent-contracts.md) honest. *"There is exactly one loop in this codebase"* is a claim a judge can check in ten seconds — but only if a second `import Anthropic` cannot appear in `agents/planner` on hour five. `web-talks-http-only` also now forbids `perception`, because a dashboard that can compute a state signature is a dashboard that can disagree with the orchestrator about what it saw.

## 2.3 What the repo looks like today

`main` intentionally contains only the reviewed Markdown specification. The implementation tree shown in §2 is the target tree to create during `Ph0`; it is not a description of files currently present on this branch. This removes the old partial scaffold as an accidental source of truth and makes the first implementation commit start from the contracts above.

`Ph0` creates the workspace manifests, source directories, fixtures, environment template, and CI guardrails described in this document. It then runs `pnpm install`, installs the pinned Chromium revision, and proves the empty-but-wired workspace with `pnpm verify` and `pnpm doctor` before feature code is written.

---

## 3. TypeScript

Every package extends `tsconfig.base.json` and adds only `outDir` / `rootDir` / `references`.

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "sourceMap": true,
    "skipLibCheck": true,

    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`noUncheckedIndexedAccess` is the one somebody will want to disable at hour four. Keep it. This codebase indexes into `candidates[0]`, `steps[i]`, `ancestorPath[n]` and `assessment.gaps[j]` constantly, and one `undefined` slipping into the six-signal sum produces a `NaN` score that silently drops a candidate below the gate. That is a bug you find at hour seven with a projector warming up, not at hour two with a test.

`noFallthroughCasesInSwitch` earns its place for a specific reason here: the orchestrator is a `switch` over eleven guards and ten lap states ([04 §3](../02-architecture/04-system-architecture.md)). A missing `break` in a state machine is a silent illegal transition, which is precisely the class of bug `FR-901` claims cannot exist.

### 3.1 Types come from schemas, never the reverse

```ts
// ✅ correct — one source of truth, and the runtime validates what the type promises
export const Diagnosis = z.object({ /* ... */ });
export type Diagnosis = z.infer<typeof Diagnosis>;

// ❌ forbidden — two sources of truth drift within an hour, and the drift is silent
export interface Diagnosis { kind: string; confidence: number }
```

The schema is frozen at the end of `Ph1` ([00 §5](../00-work-plan.md)). One Zod edit after that invalidates work in three places at once: the DDL, the structured-output tool definitions, and the API response types.

---

## 4. Code conventions

### 4.1 The no-throw law

Everything in `packages/runner/**`, `packages/perception/**` and `packages/agents/*/tools/**` returns `ToolResult<T>`. It never throws across a stage boundary ([06 §1](../02-architecture/06-agent-contracts.md)).

```js
// eslint.config.js — scoped to the tool paths, not global
"no-restricted-syntax": ["error", {
  selector: "ThrowStatement",
  message: "Tools return ToolResult, never throw. See docs/02-architecture/06-agent-contracts.md §1",
}]
```

Elsewhere, throwing is fine and often right. The law exists because the deterministic pre-classifier switches on `error.code`; an escaped exception becomes an uncatalogued failure, the classifier degrades to `UNKNOWN`, and `NFR-2` quietly stops being true.

### 4.2 Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `score-candidates.ts` |
| Types / schemas | PascalCase, singular | `HealCandidate` |
| Functions | camelCase, verb-first | `scoreCandidates()` |
| Pure functions | no `async`, no I/O, no clock, no globals | `applyVetoes()` |
| Constants | SCREAMING_SNAKE, exported from one file per package | `COVERAGE_FLOOR` |
| Test files | beside the unit, `*.test.ts` | `vetoes.test.ts` |
| Fixtures | `<case>.<kind>.<ext>` | `EC-05.tape.jsonl` |

### 4.3 The ID vocabulary is the product's vocabulary

Every ID family below appears **identically** in the source, the tests, the event log, the dashboard and the spoken pitch. When a judge asks *"what blocked it?"*, the answer `V2` resolves to exactly one constant, one function, one test and one UI badge.

| Family | Means | Owned by |
|---|---|---|
| `FR-nnn` / `NFR-n` | Requirement | [02](../01-foundation/02-requirements.md) |
| `TG-n` | Transition guard on the FSM | [04 §3.3](../02-architecture/04-system-architecture.md) |
| `I-n` | Data-model invariant, asserted in code | [05 §5](../02-architecture/05-data-model.md) |
| `Vn` | Healing veto — a hard block | [13 §10](../03-algorithms/13-triage-and-healing.md) |
| `EC-nn` | Golden eval case | [16](16-agent-test-suite.md) |
| `R-n` | Rehearsal | [16 §9](16-agent-test-suite.md) |
| `M-nn` | Injectable defect on the bundled target | [19 §5](19-target-apps.md) |
| `SC-nnn` | Scenario — human-facing, stable across re-planning | [05 §2.5](../02-architecture/05-data-model.md) |
| `Phn` | Build phase | [20](../05-delivery/20-execution-plan.md) |

**Grep before you rename.** Every one of these is cited across four or five documents, and IDs are permanent from Checkpoint C1 onward: never renumber, never reuse, never delete without a stated destination.

### 4.4 Determinism has three chokepoints, and no fourth

```ts
// packages/core/src/env.ts — injected, never imported as a global
export interface Clock { now(): Date }
export interface Rng   { next(): number }
export interface IdGen { next(prefix: string): string }
```

`Date.now()`, `new Date()`, `Math.random()` and `crypto.randomUUID()` outside `packages/core/src/env.ts` are ESLint errors:

```js
"no-restricted-globals": ["error",
  { name: "Date", message: "Take Clock from RunContext — 15 §4.4" }],
"no-restricted-properties": ["error",
  { object: "Math", property: "random", message: "Take Rng from RunContext — 15 §4.4" }],
```

Every consumer takes all three from `RunContext`. In the eval harness all three are seeded from the case file, which is what makes `NFR-1` a property of the code rather than a hope ([16 §7](16-agent-test-suite.md)).

The three that are *not* on this list, and why: **the model** is nondeterministic by design and is handled by replay ([16 §3.2](16-agent-test-suite.md)); **the browser** is pinned by revision, not by injection; **the target application** is somebody else's problem, which is exactly why `EC-01`'s determinism assertion runs against the bundled one.

### 4.5 Logging

Structured, one JSON object per line, always carrying `sessionId`:

```ts
log.info({ sessionId, lapId, stepId, event: "heal.decided",
           veto: null, score: 0.891, strategy: "role_name" });
```

**Never log evidence content — log the `evidenceId`.** Evidence lives in the store; logs are an index into it. A log line that inlines a DOM snapshot is useless to read, expensive to store, and a credential-leak vector all at once (`I-16`).

Log event names are the `SessionEventType` enum values ([05 §2.8](../02-architecture/05-data-model.md)), not free-form strings. One vocabulary for the event log, the SSE stream and the log file means a `grep` in the terminal and a filter in the dashboard find the same thing.

---

## 5. Testing

The full inventory, the fixture harness and the golden cases live in [16 · Agent Test Suite](16-agent-test-suite.md). Only the parts that constrain *how code is written* belong here.

| Tier | Location | Budget | Needs |
|---|---|---|---|
| Unit | `packages/*/src/**/*.test.ts` | **< 5 s** whole suite | nothing |
| Contract | `packages/*/test/contract/**` | < 15 s | fixtures |
| Replay | `packages/evals/test/**` | < 30 s | fixtures, no browser, no key |
| Golden | `fixtures/golden/**` via `forge eval` | < 180 s | Chromium + a live target |

Four rules that shape source code rather than test code:

1. **A function that needs a mock is a function with the wrong signature.** Pure in, value out. If a test needs `vi.mock`, the dependency belongs in an argument.
2. **No network in unit or contract tests**, ever. The model client is injected; the default double is the recorded transcript.
3. **Every threshold is tested on both sides.** `0.6499 / 0.65`, `0.8499 / 0.85`, margin `0.0499 / 0.05`, floor `0.6999 / 0.70`. A one-sided threshold test passes when the comparison operator is inverted.
4. **Every veto, every guard and every invariant has a named test** at the path the owning document names. A guard with no test is a guard we are asserting, not enforcing.

---

## 6. The `forge` CLI

One entry point for everything a human or a script does. `packages/cli`, invoked as `pnpm forge <cmd>`.

| Command | Purpose | Used by |
|---|---|---|
| `forge doctor` | Verify Node, pnpm, Chromium revision, DB schema, ports, model reachability, safety env against the freeze manifest | `Ph0`, every rehearsal, T−30m |
| `forge run <url> [--user --pass] [--prd f.md] [--intent "…"] [--copilot] [--headed]` | **The whole product in one command.** Creates a session and streams it to the terminal | the demo's first beat |
| `forge explore <url>` | Exploration only → a capability map and the ranked backlog | `Ph2` |
| `forge plan --capability <id>` | One lap's plan and critique, no generation | `Ph3` |
| `forge eval [--case EC-05] [--repeat N] [--tier replay\|live] [--coverage]` | The golden-case harness | CI, `Ph1`…`Ph6` gates |
| `forge fixtures:record --case EC-05` | Promote a live run's transcript and tape into `fixtures/` | when a case is first built |
| `forge mutate <M-nn> [--off] [--param k=v]` · `forge mutations` | Toggle an injectable defect on the bundled target | the live *"break it"* beat |
| `forge reset` | Wipe `artifacts/`, restore generated suites, clear mutations, re-seed. **< 20 s** (`NFR-9`) | before every rehearsal and the demo |
| `forge seed` | Re-seed target data only | debugging |
| `forge report <sessionId> [--open]` | Re-render an existing session's report from stored rows | `Ph6` |
| `forge lint:locators` | Fail on a lower locator rung where a higher one resolved uniquely (`FR-404`) | CI |
| `forge freeze` | Write `freeze.manifest.json`: versions, browser revision, model id, git SHA | T−60m |

Two properties of this list are deliberate.

**`forge run <url>` takes one positional argument.** It is the command typed on stage, and it is the executable form of the brief's clause `M1`. Every other input is an optional flag, because `FR-001` says the URL is the sole required input and a CLI that demands more would be contradicting the requirement in the most visible place possible.

**There is no `forge demo:a` / `demo:b`.** The pre-brief edition had scripted per-beat commands because the demo was a sequence of healing scenarios. It is now one autonomous run plus a mutation toggle, so the beats are `forge run`, `forge mutate M-01`, and the dashboard. Fewer commands to type wrong in front of judges.

### 6.1 Root scripts

```jsonc
{
  "scripts": {
    "forge":      "node packages/cli/dist/bin.js",
    "dev":        "pnpm -r --parallel dev",
    "dev:sut":    "pnpm --filter @forge/sut dev",
    "build":      "pnpm -r build",
    "test":       "vitest run",
    "test:watch": "vitest",
    "lint":       "eslint . && depcruise --config .dependency-cruiser.cjs packages apps",
    "typecheck":  "tsc -b --pretty false && tsc -p apps/web --noEmit --pretty false",
    "verify":     "pnpm typecheck && pnpm lint && pnpm test && pnpm forge eval --tier replay",
    "reset":      "pnpm forge reset",
    "doctor":     "pnpm forge doctor"
  }
}
```

`pnpm verify` runs the **replay tier**, not the live tier, so it stays under a minute and needs neither a browser nor an API key. The live tier runs at phase gates and in the `golden` CI job. A gate that takes three minutes is a gate people stop running.

---

## 7. Environment

`.env.example` is committed, complete, and contains no real values.

```bash
# --- Model -------------------------------------------------------------
ANTHROPIC_API_KEY=
FORGE_MODEL=claude-opus-5
FORGE_LLM_ENABLED=true                # false ⇒ deterministic mode (rehearsal R-2)
FORGE_LLM_TIMEOUT_MS=20000

# --- Services ----------------------------------------------------------
FORGE_API_PORT=4000
FORGE_API_BIND=127.0.0.1              # loopback by default — 17 §9
FORGE_WEB_PORT=3000
SUT_PORT=4100
SUT_CONTROL_ENABLED=true              # exposes /__forge/* — loopback only

# --- Safety (NFR-5, NFR-6) ---------------------------------------------
FORGE_ALLOWED_HOSTS=localhost,127.0.0.1
FORGE_WRITE_ALLOWLIST=artifacts,apps/sut/tests
FORGE_DISPOSABLE_TARGET=false         # true ⇒ destructive affordances may be exercised (FR-209)

# --- Determinism (NFR-1) -----------------------------------------------
FORGE_SEED=20260905
FORGE_FROZEN_CLOCK=2026-01-01T00:00:00Z
FORGE_VIEWPORT=1440x900
SUT_FROZEN_CLOCK=2026-01-01T00:00:00Z

# --- Fixtures (16 §3) --------------------------------------------------
FORGE_FIXTURES=off                    # off | replay | record

# --- Configuration provenance -----------------------------------------
FORGE_CONFIG_VERSION=forge/v1          # resolved and frozen into every Session
FORGE_SECRET_PROVIDER=env              # MVP adapter; providers return secrets only at the boundary
```

`forge doctor` **fails** if `FORGE_WRITE_ALLOWLIST` has been widened, if `FORGE_ALLOWED_HOSTS` contains a non-loopback host while `FORGE_DISPOSABLE_TARGET` is true, or if `SUT_CONTROL_ENABLED` is true while the API is bound to a non-loopback address. Safety settings are not something to discover have drifted at T−15m; three environment variables are cheap to check and expensive to get wrong.

`FORGE_SECRET_PROVIDER=env` is an adapter choice, not permission to persist a secret. The provider resolves credentials only at the session boundary; `SessionConfigSnapshot` records the provider name and redaction-policy version, never its returned value. `forge doctor` rejects an unknown provider or an empty required credential reference before a session starts.

---

## 8. Git

### 8.1 Branches and commits

```
main                       always green, always demoable
ph3/coverage-critic        one phase slice, one branch
fix/tg-10-rollback
docs/batch-4-build         documentation batches branch too
```

**`main` is demoable at every commit.** From `Ph3` onward this is enforced socially: if `main` cannot run `forge run http://localhost:4100`, that is the only thing anyone works on.

```
Ph5 healing: add the destructive-verb veto (V2)

Blocks any candidate whose accessible name matches the destructive
lexicon when the fingerprint's name did not. Evaluated before scoring,
so no confidence value can reach it.

Closes FR-704, FR-705. Eval: EC-06.
```

First line `Ph<n> <area>: imperative summary`; body cites the `FR-` and the `EC-`. That is what makes the trace matrix in [02 §11](../01-foundation/02-requirements.md) auditable with `git log --grep`, and it replaces the retired `T-###` scheme one-for-one.

### 8.2 The machine-owned path guard (`FR-407`)

`tests/generated/**` inside any emitted suite is written by the compiler and by nothing else. This is the brief's *"no manually written test scripts"* exclusion made structurally checkable, and it is the row in [00 §3.4](../01-foundation/00-problem-alignment.md) with actual teeth.

```yaml
# .github/workflows/ci.yml — the guard job
- name: generated code is machine-owned
  run: |
    if git diff --name-only origin/main...HEAD | grep -E '(^|/)tests/generated/'; then
      echo "::error::A human commit touched tests/generated/**. See docs/04-build/15 §8.2."
      exit 1
    fi
```

Every team will *claim* their agent wrote the tests. We make the claim falsifiable, and the check runs on every pull request whether anyone remembers it or not.

### 8.3 Tags and `.gitignore`

| Tag | When | Why |
|---|---|---|
| `pre-brief` | already cut | Proof of what existed before the problem statement arrived |
| `freeze` | T−60m, after `forge freeze` | The rollback point |
| `submitted` | at submission | What the judges received |

```
artifacts/
apps/sut/state/
node_modules/
.env
*.db
*.db-wal
*.db-shm
.auth/
```

`.auth/` is listed for a specific reason: `storageState` contains live session cookies. It is treated as a secret — never attached as evidence, redacted from event payloads, excluded from the artifacts bundle ([09 §2.3](../03-algorithms/09-exploration-and-prioritisation.md)).

---

## 9. Definition of Done

A slice is done when **all** of these hold. No partial credit, and the list is short enough to read at hour six.

- [ ] `pnpm verify` is green locally
- [ ] The cited `FR-###` acceptance criteria are demonstrably met — not approximately met
- [ ] Unit tests cover the happy path **and** each failure branch; every new threshold is tested on both sides
- [ ] Any new nondeterminism goes through `RunContext`, never a global
- [ ] No `any`; no `@ts-expect-error` without a comment naming the reason
- [ ] Public functions carry a one-line comment stating pre- and post-conditions
- [ ] If behaviour visible in a demo beat changed, the relevant `EC-nn` still passes
- [ ] If an architectural decision changed, an ADR was added or amended
- [ ] The document that owns the changed behaviour changed in the same commit

The last one is the working agreement that costs the most and saves the most: **the docs are the spec, not a description of the code.** A behaviour change with no doc edit fails review, because the next person to read the document will implement against a lie.

---

## 10. CI

Five jobs, each with a stated budget. Deliberately absent: retries, reruns, and `continue-on-error`. A flaky test that CI retries into green is a flaky demo nobody knows about.

| Job | Budget | Runs | Gate |
|---|---|---|---|
| `guard` | 2 min | every push | `typecheck`, `lint`, `forge doctor`, `lint:locators`, the machine-owned-path check |
| `unit` | 1 min | every push | `pnpm test` — the whole unit and contract tier |
| `replay` | 2 min | every push | `forge eval --tier replay` — all seven cases, no browser, no key |
| `golden` | 6 min | pull requests and `main` | `forge eval --tier live --case EC-05 --case EC-06` — the heal and the two refusals, against the bundled target |
| `nightly` | 20 min | nightly and before the freeze | all seven live, plus `forge eval --repeat 5` — zero verdict variance (`NFR-1`) |

The per-PR `golden` job runs two cases rather than seven on purpose: `EC-05` and `EC-06` are the ones whose numbers are spoken aloud, and a twelve-minute pull-request gate is a gate people learn to ignore. The other five run live nightly and at every phase gate ([16 §2](16-agent-test-suite.md)).

The browser revision belongs in the Playwright cache key. Screenshot and geometry output are not stable across Chromium revisions, and two of the six healing signals read geometry.

### 10.1 `forge eval` exit codes

`forge eval` exits **0 when every case matched its expected verdict** — including the four cases whose own sessions exit 1 or 2. Only a harness error is a CI failure.

Getting this backwards would make CI demand that FORGE stop finding bugs, which is the single most self-defeating thing this repository could assert.

### 10.2 Git hooks

| Hook | Runs | Budget |
|---|---|---|
| `commit-msg` | Shape check against `Ph<n> <area>: summary` | 50 ms |
| `pre-commit` | `lint-staged` — eslint `--fix`, prettier | < 3 s |
| `pre-push` | `pnpm typecheck && pnpm test` | < 10 s |

**`forge eval` is deliberately not in `pre-push`.** A hook that takes longer than ten seconds gets bypassed with `--no-verify` within a day, and a bypassed hook is worse than no hook: it provides false assurance while training you to skip gates.

### 10.3 What we deliberately do not automate

| Not automated | Why |
|---|---|
| **Retries in CI** | A flaky test that CI retries into green is a flaky demo nobody knows about. Every red run is investigated; nothing is re-run to see if it passes this time |
| **Flake tolerance** | No `test.retry()`, no quarantine list. Flake is a determinism bug; it gets fixed or the case gets cut. A quarantine list is where problems go to be forgotten until the worst possible moment |
| **Dependency updates** | Renovate and Dependabot stay off. A patch bump to Playwright changes the pinned browser revision, which moves two healing signals and breaks `NFR-1` |
| **Fixture refresh** | Tapes and transcripts are promoted by hand from a run that passed live, and reviewed in the diff ([16 §3.5](16-agent-test-suite.md)). A harness that refreshes its own expectations has no expectations |
| **Editing `tests/generated/**`** | Machine-owned (§8.2). Tracked in git precisely so `git diff` can show a heal landing, and generated precisely so that diff means something |

**When `main` is red, revert first and diagnose second.** The instinct to fix forward is what turns a fifteen-minute problem into an hour, and on a six-hour clock an hour is a sixth of the project.

---

## 11. `Ph0` — the pre-flight, in fifteen minutes

Order matters; each step is verifiable before the next begins.

```bash
# 1 · Toolchain matches the pins
node -v                                     # must equal .nvmrc
corepack enable && corepack prepare pnpm@10.12.4 --activate
pnpm install --frozen-lockfile

# 2 · Reshape the tree to §2, then prove the guardrails still hold
#     (rename packages/agent → packages/agents/*, add perception + orchestrator,
#      extend .dependency-cruiser.cjs, vitest aliases, tsconfig references)
pnpm lint                                   # must pass on the reshaped, still-empty tree

# 3 · Browser, pinned
pnpm exec playwright install chromium --with-deps

# 4 · Prove the whole chain end to end before writing a feature
pnpm forge doctor                           # exits non-zero on any drift
pnpm dev:sut & curl -sf localhost:4100/ >/dev/null && echo "target up"
pnpm verify                                 # green on an empty repo
```

**Step 2 before step 4 is the whole point of this section.** Guardrails on an empty tree cost minutes and catch the import mistake that would otherwise be discovered when `core` accidentally imports `store` at hour five and forty unit tests suddenly need a database.

---

## 12. Related documents

- What each package must satisfy → [06 · Agent Contracts](../02-architecture/06-agent-contracts.md)
- The schemas `packages/core/schema` holds → [05 · Data Model](../02-architecture/05-data-model.md)
- The tests these conventions exist to make cheap → [16 · Agent Test Suite](16-agent-test-suite.md)
- The surface `apps/api` exposes → [17 · API Spec](17-api-spec.md)
- What `apps/web` renders → [18 · UI Spec](18-ui-spec.md)
- What `apps/sut` is and what else we point at → [19 · Target Applications](19-target-apps.md)
- Which phase builds what → [20 · Execution Plan](../05-delivery/20-execution-plan.md)
- Why it is local-first with one compose file → [ADR-015](../decisions/ADR-015-deployment.md)
