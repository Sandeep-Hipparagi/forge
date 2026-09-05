# 06 · Agent Contracts

> **Renamed from `06-tool-contracts`.** The old document described a toolbox for one model call. This one describes eight components, two of which run bounded loops, and the harness that bounds them.
> **Governing decision:** [ADR-011](../decisions/ADR-011-agent-topology.md) — agency where the world is unknown, determinism where the answer will be audited.
> **The law of this document:** a tool never throws. Every failure is a value.

---

## 1. The no-throw law

Every tool in FORGE returns the same shape. Nothing in `packages/runner`, `packages/perception` or `packages/core` throws across a stage boundary.

```ts
type ToolResult<T> =
  | { ok: true;  data: T; evidenceIds: string[]; durationMs: number }
  | { ok: false; error: ToolError; evidenceIds: string[]; durationMs: number };

type ToolError = {
  code: ToolErrorCode;        // stable enum — the classifier switches on this
  message: string;            // human-readable, never used for logic
  detail?: Record<string, unknown>;
};
```

The classifier switches on `error.code`, so a typo in a message string can never change a verdict. This is the single property that makes the deterministic pre-classifier trustworthy, and therefore the property that makes `NFR-2` (works with no model) possible at all.

```ts
type ToolErrorCode =
  | "LOCATOR_NOT_FOUND"        // resolved to 0 elements
  | "LOCATOR_AMBIGUOUS"        // resolved to 2+ elements — never acted on
  | "ASSERTION_FAILED"         // element found, claim false   ← the PRODUCT_BUG signal
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "TARGET_UNREACHABLE"       // ← the ENVIRONMENT signal
  | "ELEMENT_NOT_INTERACTABLE"
  | "ACTION_DENIED"            // blocked by the destructive deny-list — FR-106
  | "OFF_ORIGIN"               // navigation left the target origin — FR-109
  | "BUDGET_EXHAUSTED"         // a ceiling was reached; partial data is still returned
  | "SCRIPT_ERROR"
  | "INTERNAL";
```

> The split between `LOCATOR_NOT_FOUND` and `ASSERTION_FAILED` is the entire product in one enum. The first means *we could not find the thing*. The second means *we found it and it was wrong*. The first is healable; the second never is.

Three codes are new since the re-aim, and each exists because exploration touches somebody else's application: `ACTION_DENIED` and `OFF_ORIGIN` are safety outcomes, not errors — the affordance is recorded as `observedNotExercised` and the crawl continues. `BUDGET_EXHAUSTED` is the one code that arrives **with usable data attached**; a loop that runs out of budget returns its best partial result rather than nothing.

---

## 2. `runAgentLoop()` — the one place a loop is written

Two stages face an open world and therefore run a loop: the **Explorer** and the **Planner**. Three stages make a single judgement over evidence they are handed and therefore do not: the **Critic**, **Triage** and **Adjudicate**. Four stages never call a model at all.

Every loop goes through one harness. There is no second loop anywhere in the codebase, and that is enforced by review and by the import graph: only `packages/agents/harness` imports the model client.

```ts
// packages/agents/harness/src/loop.ts
export type AgentLoopSpec<TOut> = {
  name: "explorer" | "planner";
  system: string;                    // frozen constant — cached, see 07 §4
  seed: Anthropic.MessageParam[];    // the task, the shell, the subgraph
  tools: RegisteredTool[];           // the least-privilege set for this agent — §3
  emit: {                            // the terminal tool: calling it ends the loop
    name: string;                    // e.g. "emit_capability_map"
    schema: z.ZodType<TOut>;
  };
  ceilings: {
    toolCalls: number;               // hard count, not a prompt instruction
    modelTurns: number;
    wallClockMs: number;
    maxTokens: number;
  };
};

export type AgentLoopResult<TOut> = {
  ok: boolean;
  output: TOut | null;               // null only if even the forced close failed
  exitReason:
    | "EMITTED"                      // the model called the terminal tool  (the good path)
    | "CEILING_TOOL_CALLS"
    | "CEILING_TURNS"
    | "CEILING_TIME"
    | "FORCED_CLOSE"                 // ceiling hit, we forced the emit — output is partial
    | "SCHEMA_FAILED"                // two validation failures in a row
    | "MODEL_UNAVAILABLE";           // caller falls back to the deterministic path
  transcriptEvidenceId: string;      // content-addressed, linked from the FSM state
  usage: Usage;
};

export async function runAgentLoop<TOut>(
  spec: AgentLoopSpec<TOut>, ctx: AgentContext,
): Promise<AgentLoopResult<TOut>>;
```

### 2.1 How the loop terminates

```
   ┌─► call the model with { tools, emit-tool }
   │        │
   │        ├─ model calls a tool      → execute it (never throws) → append ToolResult
   │        │                            → counters++ → loop
   │        ├─ model calls emit-tool   → validate against emit.schema
   │        │                            ├─ valid   → EMITTED, return
   │        │                            └─ invalid → append the Zod issues, retry once
   │        └─ model ends its turn     → nudge once, then force the close
   │
   └─ any ceiling reached → ONE final call with tool_choice forcing the emit tool
                            → whatever it returns is validated and returned as partial
```

Two decisions in that diagram deserve their own justification.

**The terminal tool, not free text.** The agent's output arrives as the *input to a tool it calls*, declared `strict: true` so the input is guaranteed to validate against the schema. It is impossible for the Explorer to end a loop with prose; the only exit that counts is a structured artefact. See [07 §3](07-llm-integration.md) for the API shape.

**The forced close.** When a ceiling is reached we do not discard the work — we make one final call with `tool_choice` pinned to the emit tool, which turns "the Explorer ran out of budget" into "the Explorer produced a partial capability map and said so". `exitReason: "FORCED_CLOSE"` propagates into `CapabilityMap.frontier.haltReason` and from there into the report's untested-flow risk section. Budget exhaustion becomes a *disclosed* limitation instead of an invisible one.

### 2.2 Why we write the loop instead of using the SDK's tool runner

The Anthropic TypeScript SDK ships `client.beta.messages.toolRunner()`, which drives this cycle for you and supports per-turn hooks. It is the right default for most agents and we would use it in a product.

We write our own because of one requirement: **`FR-708`, `FR-107` and `ADR-008`'s central claim — limits are counters, not instructions.** The ceilings, the deny-list interception, the forced close and the transcript-as-evidence are the auditable part of the story; a judge asking *"what stops it exploring forever?"* gets pointed at a `for` loop with a counter in our repository, not at a beta helper's option object. The loop is about forty lines. That is a cheap price for the answer.

The flip trigger is stated so this does not become dogma: if we ever need per-token streaming inside a sub-agent, or the hook surface grows past what forty lines can express, move to the tool runner and keep the counters in the hooks.

### 2.3 The one thing a sub-agent may not do

`packages/agents/*` cannot import `packages/store`. A sub-agent returns a value; the orchestrator persists it. A sub-agent that can write to the event log can rewrite the history the audit story depends on ([04 §2.2](04-system-architecture.md)).

---

## 3. Tool registry — least privilege per agent

A sub-agent sees only the tools its task requires. This is not tidiness; the Critic having page access would let it verify a gap by looking, which is precisely the non-reproducible behaviour the deterministic score exists to avoid.

| Tool | Explorer | Planner | Critic | Triage |
|---|:--:|:--:|:--:|:--:|
| `snapshot()` | ✅ | ✅ read-only | — | — |
| `navigate()` | ✅ | — | — | — |
| `click()` / `fill()` / `select()` | ✅ *(deny-list enforced)* | — | — | — |
| `back()` | ✅ | — | — | — |
| `getStateGraph()` | ✅ | ✅ | ✅ | — |
| `getPlan()` | — | ✅ | ✅ | — |
| `getPrdSection()` | — | ✅ | ✅ | — |
| `getEvidenceBundle()` | — | — | — | ✅ |
| **any page access at all** | ✅ | read-only | **❌** | **❌** |

**Triage has no browser tools by construction** (`FR-603`). It receives a serialised evidence bundle and reasons over it. There is no tool it could call to fetch a fresh page, which means a diagnosis is reproducible from stored evidence — and that is what makes replaying a diagnosis in the eval harness meaningful.

**The Planner's page access is read-only.** It may look at a state's snapshot to write a precise step; it may not click anything. Exploration already happened, and a Planner that navigates is a Planner whose plan depends on the order it happened to browse in.

---

## 4. The eight component contracts

### 4.1 Explorer — *"what can this application do?"* · agentic

| | |
|---|---|
| Package | `packages/agents/explorer` |
| Input | `{ url, credentials?, intent?, budget }` |
| Output | `CapabilityMap` (states, transitions, affordances, capabilities, frontier) |
| Ceilings | 40 tool calls · 8 model turns · 90 s |
| Model | Call site 1 — one call per frontier batch |
| Fallback | Breadth-first structural crawl over observed affordances; `assessmentSource: "deterministic"` |
| Requirements | `FR-101`…`FR-110` |

```ts
explore(input: ExplorerInput, ctx: AgentContext): Promise<ToolResult<CapabilityMap>>
```

The model's job in this loop is **choosing what to visit next**, not perceiving. Perception is deterministic ([08](08-perception-layer.md)); the frontier, the signatures and the deny-list are code. The model is asked, once per batch: *given these unvisited affordances, which are worth exercising and why?* That is the only open-world judgement in the stage, and it is the only part that degrades when the model is gone.

### 4.2 Planner — *"what is worth testing, and how?"* · agentic

| | |
|---|---|
| Package | `packages/agents/planner` |
| Input | `{ capability, subgraph, shell, prd?, intent?, carriedGaps? }` |
| Output | `TestPlanDraft` → validated and grounded into `TestPlan` |
| Ceilings | 12 tool calls · 4 model turns · 20 s |
| Model | Call site 2 — once per capability per round |
| Fallback | Template plan derived from the capability's affordances |
| Requirements | `FR-201`…`FR-209` |

```ts
plan(input: PlannerInput, ctx: AgentContext): Promise<ToolResult<TestPlan>>
```

**`carriedGaps` is the re-plan channel.** On round 1 and 2 the Planner receives the Critic's named gaps and is asked to address them specifically. It is also handed the previous round's scenarios so that `scenarioId` survives for anything unchanged (`FR-205`, `I-14`) — a re-plan that renumbers everything makes the before/after diff unreadable, which destroys the demo beat it exists to produce.

**Grounding is validated after the loop, not requested inside it.** Every emitted step must carry a `stateId` and `affordanceRef` that resolve in the capability map (`TG-5a`, `I-13`). A step that references an unobserved element fails validation and is dropped with a reason; if that leaves the plan under three scenarios, the round is retried. Asking a model nicely not to hallucinate a button is not a control. Refusing to compile the step is.

### 4.3 Critic — *"what did we miss?"* · one call, no loop

| | |
|---|---|
| Package | `packages/agents/critic` + `packages/core/critic` |
| Input | `{ plan, capability, subgraph, prd? }` — no page access |
| Output | `CoverageAssessment` |
| Ceilings | 1 model call · 15 s |
| Model | Call site 3 |
| Fallback | **The stage still runs.** Structural score plus class-presence gaps, `source: "deterministic"` (`FR-308`) |
| Requirements | `FR-301`…`FR-308` |

```ts
// packages/core/critic — pure, no model, no I/O
structuralScore(plan: TestPlan, sub: CapabilitySubgraph): StructuralCoverage;
classGaps(plan: TestPlan): Gap[];          // missing negative / boundary / error-state cases

// packages/agents/critic — the semantic half
semanticGaps(input: CriticInput, ctx: AgentContext): Promise<ToolResult<Gap[]>>;

// the composition the orchestrator calls
assess(plan, sub, ctx): Promise<CoverageAssessment>;
```

The Critic is deliberately split in half. The structural score is arithmetic over the capability subgraph — affordances exercised, transitions traversed, states reached — and is bit-reproducible from stored inputs (`FR-303`). The semantic gaps are a judgement and come from the model. **The blocking decision uses both, but the floor is arithmetic**, so `TG-5b` never depends on a model being available or agreeing with itself twice.

### 4.4 Generator — *"what is the executable form?"* · **no model, ever**

| | |
|---|---|
| Package | `packages/core/compile` |
| Input | `TestPlan` + a live `Page` for validation |
| Output | `.spec.ts` files, `Scenario.steps[].locator` populated, fingerprints captured |
| Requirements | `FR-401`…`FR-409` |

```ts
compile(plan: TestPlan): CompiledSuite;                       // pure, deterministic, testable
validate(suite: CompiledSuite, page: Page): Promise<ToolResult<ValidatedSuite>>;  // TG-7
emitProject(suite: ValidatedSuite, outDir: string): Promise<ToolResult<string[]>>;
```

Compiling the same plan twice is byte-identical. Model output is never `eval`ed, never templated into source, never written to disk as code (`FR-401`, `NFR-5`). `validate()` is where `TG-7` lives: every locator must resolve to exactly one element and every assertion must pass against the current build before the file is written. A scenario that cannot satisfy that is dropped with a stated reason and appears in the report as a gap — never emitted red.

### 4.5 Runner — *"what actually happened?"* · **no model**

| | |
|---|---|
| Package | `packages/runner` |
| Output | `Run`, `Evidence[]`, `ElementFingerprint[]` |
| Requirements | `FR-501`…`FR-509` |

```ts
execute(suite: ValidatedSuite, ctx: LapContext): Promise<ToolResult<RunSet>>;
rerunScenario(scenarioId: string, ctx: LapContext): Promise<ToolResult<Run>>;   // FR-707
```

Fixed viewport, animations disabled, clock frozen where the app permits, Chromium only. A step that passes on retry is `FLAKY`, never `PASSED` (`FR-509`) — quarantining a flake is more useful than laundering it.

### 4.6 Triage — *"test broken, or product broken?"* · one call, no page access

| | |
|---|---|
| Package | `packages/agents/triage` + `packages/core/diagnose` |
| Input | A serialised `EvidenceBundle`. **No tool can fetch a new page.** |
| Output | `Diagnosis` |
| Ceilings | 1 model call · 10 s · skipped entirely when a veto fired |
| Model | Call site 4, keyed on `failureSignature` — a repeat costs nothing |
| Fallback | The deterministic verdict, `source: "deterministic"` (`FR-605`) |
| Requirements | `FR-601`…`FR-607` |

```ts
preClassify(bundle: EvidenceBundle): Diagnosis;         // pure · runs FIRST · FR-604
refine(bundle, pre, ctx): Promise<ToolResult<Diagnosis>>;   // skipped when pre.final
```

`preClassify()` runs before any model call and its vetoes are `final: true`. **No model output can unblock a veto.** The model is shown the pre-classification and asked to agree, refine, or dissent with a stated reason — dissent is itself a signal and is logged, but it cannot promote an outcome past a veto.

### 4.7 Healer — *"can this be repaired safely?"* · arithmetic, plus one call in the ambiguous band

| | |
|---|---|
| Package | `packages/core/healing` |
| Requirements | `FR-701`…`FR-711` |

```ts
generateCandidates(intent, fp, page): Promise<ToolResult<RawCandidate[]>>;  // needs a browser
scoreCandidates(fp, raw, history): HealCandidate[];    // pure · six signals · no model
applyVetoes(input: VetoInput): VetoResult;             // pure · V1…V5 · runs BEFORE scores
patch(scenario, stepId, locator): { scenario: Scenario; diff: string };     // pure
verify(scenarioId, ctx): Promise<ToolResult<Verification>>;                 // TG-10
rollback(patchId, ctx): Promise<ToolResult<void>>;     // byte-exact · FR-710
adjudicate(top2, ctx): Promise<ToolResult<Adjudication>>;   // call site 5 · 0.65–0.85 only
```

Five of these seven are pure functions, which is why forty unit tests cover the healing logic in under a second and why the scoring table shown on stage is reproducible arithmetic. `adjudicate()` can only ever **lower** an outcome — accept → review → escalate. Ceilings are set by arithmetic; the model may be more cautious than the arithmetic, never less.

### 4.8 Reporter — *"how healthy is this application?"* · **no model**

| | |
|---|---|
| Package | `packages/core/report` |
| Requirements | `FR-801`…`FR-807` |

```ts
buildReport(sessionId: string, store: ReadOnlyStore): QualityReport;   // pure over stored rows
render(report: QualityReport): { html: string; markdown: string; json: string };
```

A pure function of stored rows, which is why it can be regenerated after every lap for essentially nothing — and why a report always exists, even if the session is killed at 40%.

---

## 5. Tool signatures

### 5.1 Perception (`packages/perception`)

```ts
snapshot(ctx): Promise<ToolResult<AccessibilitySnapshot>>;
   // roles, names, refs — NOT a DOM dump. < 8 KB for a 200 KB page (FR-104). See 08.

stateSignature(snap: AccessibilitySnapshot): string;        // pure · 16 hex chars · FR-108
affordancesOf(snap: AccessibilitySnapshot): Affordance[];   // pure · deny-list applied
getDomSnapshot(ctx): Promise<ToolResult<{ evidenceId: string; sha256: string }>>;
```

`getDomSnapshot` normalises before hashing — strip `<script>`, strip style bodies, sort attributes, collapse whitespace, remove framework hydration attributes. Normalisation is what makes `sha256` a meaningful *"did the DOM change"* signal instead of noise.

### 5.2 Actions (`packages/runner/tools/actions.ts`)

```ts
click(ctx, locator, opts?): Promise<ToolResult<{ bbox: BBox }>>;
fill(ctx, locator, value, opts?): Promise<ToolResult<{ bbox: BBox }>>;
selectOption(ctx, locator, value, opts?): Promise<ToolResult<{ bbox: BBox }>>;
press(ctx, key): Promise<ToolResult<void>>;
navigate(ctx, url): Promise<ToolResult<{ finalUrl: string; status: number }>>;
back(ctx): Promise<ToolResult<{ finalUrl: string }>>;
waitFor(ctx, locator, state): Promise<ToolResult<void>>;
```

Every action tool, in order:

1. Checks the deny-list. A destructive affordance returns `ACTION_DENIED` **without acting** and is recorded as `observedNotExercised` (`FR-106`, `I-20`).
2. Resolves the locator and records `resolvedCount`.
3. Returns `LOCATOR_NOT_FOUND` (0) or `LOCATOR_AMBIGUOUS` (2+) **without acting**.
4. Performs the action.
5. Captures an `ElementFingerprint` on success (`FR-406`).
6. Emits a step-scoped screenshot.

Steps 1 and 3 are safety properties. An ambiguous locator never acts — acting on "the first match" is how self-healing tools quietly click the wrong button.

### 5.3 Assertions (`packages/runner/tools/assertions.ts`)

```ts
assertText(ctx, locator, expected, mode?): Promise<ToolResult<{ actual: string; matched: boolean }>>;
assertVisible(ctx, locator): Promise<ToolResult<{ visible: boolean; bbox: BBox | null }>>;
assertUrl(ctx, expected, mode?): Promise<ToolResult<{ actual: string }>>;
assertCount(ctx, locator, expected: number): Promise<ToolResult<{ actual: number }>>;
```

**The critical contract.** When an assertion fails, the error code depends on *why*:

| Situation | Code | Downstream meaning |
|---|---|---|
| Locator resolved, content differs | `ASSERTION_FAILED` | Candidate `PRODUCT_BUG` — **healing is vetoed (V1)** |
| Locator resolved to 0 elements | `LOCATOR_NOT_FOUND` | Candidate `LOCATOR_BREAK` — healing permitted |
| Locator resolved to 2+ | `LOCATOR_AMBIGUOUS` | Escalate |

Every failed assertion attaches `detail.actual` and `detail.expected` verbatim. Those two strings are what vetoes `V1` and `V3` analyse, and what the defect report quotes to a developer.

### 5.4 Persistence (`packages/store`) — orchestrator-only

```ts
appendEvent(sessionId, actor, type, payload): Promise<SessionEvent>;   // gapless seq · I-1
putEvidence(sessionId, type, payload, label): Promise<Evidence>;       // content-addressed · I-2
openLap(sessionId, capabilityId): Promise<Lap>;
bankLap(lap, outcome, error?): Promise<Lap>;
saveFingerprint(fp): Promise<void>;
loadFingerprintHistory(scenarioId, stepId, limit = 10): Promise<ElementFingerprint[]>;
safeWrite(path, content): Promise<void>;                               // allowlisted · I-9
```

---

## 6. Budgets (`NFR-3`)

| Operation | p50 | p95 | Hard cap | On cap |
|---|---|---|---|---|
| `snapshot` | 180 ms | 500 ms | 3 s | `TIMEOUT`, state recorded as partial |
| `stateSignature` | 1 ms | 3 ms | 50 ms | — (pure) |
| `click` / `fill` | 80 ms | 500 ms | step timeout | `TIMEOUT` |
| `navigate` | 400 ms | 1.5 s | 10 s | `NAVIGATION_FAILED` |
| `getDomSnapshot` | 120 ms | 400 ms | 2 s | `TIMEOUT` |
| `generateCandidates` | 200 ms | 600 ms | 3 s | fewer candidates, scored anyway |
| `scoreCandidates` | 2 ms | 8 ms | 100 ms | — (pure) |
| `verify` | 2.5 s | 5 s | 15 s | rollback + escalate |
| **Explorer loop** | 45 s | 80 s | **90 s / 40 calls / 8 turns** | forced close, partial map |
| **Planner loop** | 6 s | 14 s | **20 s / 12 calls / 4 turns** | forced close, partial plan |
| **Critic call** | 4 s | 10 s | **15 s** | deterministic score only |
| **Triage call** | 2 s | 6 s | **10 s** | deterministic verdict |

Every cap is a `Promise.race` that resolves to `{ ok: false, code: "TIMEOUT" }` — never an unhandled rejection. A hung tool must degrade into a classifiable failure, not a frozen demo.

---

## 7. Context objects

```ts
type AgentContext = {
  sessionId: string;
  lapId: string | null;
  page: Page | null;              // null for Critic and Triage — they cannot look
  emit: (e: Omit<SessionEvent, "seq" | "sessionId" | "at">) => void;
  budget: { deadlineAt: number; toolCallsRemaining: number };
  logger: Logger;
  // deliberately absent: `store`. Sub-agents return values; they do not persist.
};

type LapContext = AgentContext & {
  lapId: string;
  capability: Capability;
  baseline: BaselineSnapshot | null;   // last green run — powers the "newSince*" deltas
  store: Store;                        // the orchestrator's context, not an agent's
};
```

Threaded explicitly through every call. No module-level singletons, no ambient globals — which is what lets a lap be isolated in a test, and lets four laps run in parallel without either noticing the other (`FR-506`).

**`budget.toolCallsRemaining` is passed to the model as a mid-conversation system message**, not by rewriting the system prompt, so the cached prefix survives ([07 §4](07-llm-integration.md)). The agent knows how much rope it has left and paces itself; the counter, not the agent, is what actually stops it.

---

## 8. Testing these contracts

Every contract in this document is exercisable without a model and without a browser, which is the whole reason they are shaped this way:

- **Pure functions** — `stateSignature`, `affordancesOf`, `structuralScore`, `classGaps`, `preClassify`, `scoreCandidates`, `applyVetoes`, `patch`, `compile`, `buildReport` — take fixtures in and return values out. No mocks.
- **Loops** — `runAgentLoop` takes an injectable model client. The recorded-fixture harness replays a stored transcript, so `EC-02` asserts the Explorer's behaviour deterministically with the key unset.
- **Browser tools** — replayed against saved snapshots and DOM fixtures; only the smoke tests need a live Chromium.

Details, golden cases and the determinism gate: [16 · Agent Test Suite](../04-build/16-agent-test-suite.md), which is built **before** the agents it tests.

---

## 9. Related documents

- Why the boundary sits where it sits → [ADR-011](../decisions/ADR-011-agent-topology.md)
- The states these contracts are called from → [04 · System Architecture §3](04-system-architecture.md)
- The shapes they return → [05 · Data Model](05-data-model.md)
- The API mechanics behind the terminal tool and the forced close → [07 · LLM Integration](07-llm-integration.md)
- What `snapshot()` actually returns → [08 · Perception Layer](08-perception-layer.md)
