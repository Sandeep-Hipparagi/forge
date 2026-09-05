# 07 · LLM Integration

> **Verified against the current Anthropic API (2026).** Several patterns you may remember from older code now return a 400 — §8 lists them. Copy from this document, not from memory.
> **Revised at Batch 2:** three call sites became five, and the loop stages need a second output mechanism the pre-brief edition did not have.

---

## 1. Model choice — and the resolution of `W-2`

Work-plan item `W-2` asked: one model everywhere, or a cheap model for exploration and a strong one for critique?

**Resolved: one model, `claude-opus-5`, everywhere. Effort is the per-call-site lever, not the model id.**

| Setting | Value | Why |
|---|---|---|
| Model | `claude-opus-5` | 1M context, $5 / $25 per MTok. The strongest reasoning available to us, and diagnosis quality *is* the product. |
| Thinking | `{ type: "adaptive" }` | On by default for Opus 5. `budget_tokens` is **removed** and returns 400. |
| Effort | per call site — see §3 | This is where the cost/quality trade is made. |
| Sampling | none | `temperature` / `top_p` / `top_k` return **400** on Opus 5. Depth is controlled by `effort`. |
| Refusal fallback | `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"` | Opus 5 can return `stop_reason: "refusal"` at HTTP 200. Server-side routing means we never maintain a model list. |

Three reasons the single-model answer wins, in ascending order of importance:

1. **One pinned id is one thing `pnpm forge doctor` has to check.** A model swap between rehearsal and demo is exactly the silent change that ruins a run (`NFR-7`).
2. **Lower effort on a strong model generally beats high effort on a weaker one**, so the cheap-model instinct usually buys less than it costs.
3. **Caches are model-scoped.** A second model is a second cache namespace, and the lap shell — the thing we cache hardest (§4) — would stop being reused across the two. A cost optimisation that halves the cache hit rate is not obviously an optimisation.

**What would change this, measured in Ph2, not guessed now:** if call site 1 (Explore) turns out to dominate token spend — it is the highest-volume and lowest-judgement call — move *only* that site to `claude-haiku-4-5` (200K context, $1 / $5) and accept the second cache namespace for that one site. The instrumentation in §7 exists to make that a decision with numbers behind it. Until it has numbers, the default stands.

Pin the id in exactly one place:

```ts
// packages/agents/harness/src/model.ts
export const FORGE_MODEL = process.env.FORGE_MODEL ?? "claude-opus-5";
```

---

## 2. Two output mechanisms, and when each applies

Every model call in FORGE produces a **validated structured value**. Nothing parses free text. There are two ways to get one, and which you use depends on whether the stage runs a loop.

| | Single-shot judgement | Bounded loop |
|---|---|---|
| Stages | Critic, Triage, Adjudicate | Explorer, Planner |
| Mechanism | `client.messages.parse()` + `output_config.format` | a **terminal tool**, declared `strict: true`, plus a forced close |
| Why | The model sees everything it needs in one prompt; there is nothing to iterate over. | The model must interleave tool calls with reasoning; the artefact is the *exit condition*. |
| Validation | `zodOutputFormat` — the SDK parses and validates | `strict: true` guarantees the tool input matches the schema; we re-validate with Zod anyway |

### 2.1 Single-shot: `messages.parse()`

```ts
// packages/agents/harness/src/structured.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();          // resolves ANTHROPIC_API_KEY, or an `ant auth login` profile

export async function callStructured<T extends z.ZodTypeAny>(args: {
  schema: T;
  system: string;
  user: Anthropic.MessageParam["content"];
  maxTokens: number;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  callSite: "critique" | "triage" | "adjudicate";
  showReasoning?: boolean;
}): Promise<z.infer<T>> {
  const res = await client.messages.parse({
    model: FORGE_MODEL,
    max_tokens: args.maxTokens,
    thinking: { type: "adaptive", display: args.showReasoning ? "summarized" : "omitted" },
    output_config: { effort: args.effort, format: zodOutputFormat(args.schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.user }],
  });

  if (res.stop_reason === "refusal") throw new LlmRefusal(res.stop_details?.category ?? null);
  if (!res.parsed_output) throw new LlmSchemaError("parsed_output was null");

  recordUsage(args.callSite, res.usage);
  return res.parsed_output;
}
```

Four details that are easy to get wrong:

- **`output_config.format`**, not the deprecated top-level `output_format`.
- **`effort` lives inside `output_config`.** At the top level it is silently ignored.
- **Check `stop_reason === "refusal"` before reading content.** A refusal is HTTP 200, not an exception, and `stop_details` is populated *only* for refusals — guard before reading it.
- **`parsed_output` can be `null`** when parsing fails. Guard it; do not use `!`.

`showReasoning` exists for one reason: thinking `display` defaults to `"omitted"` on Opus 5, which means an empty `thinking` block. We set `"summarized"` on the **Triage** call so the decision inspector can show *why* the classifier reached its verdict alongside the cited evidence. Display changes visibility only — thinking happens and is billed identically either way.

### 2.2 Loop stages: the terminal tool and the forced close

The Explorer and the Planner end their loops by calling a tool whose input schema *is* their output schema.

```ts
// packages/agents/harness/src/emit.ts
const emitCapabilityMap: Anthropic.Tool = {
  name: "emit_capability_map",
  description: "Emit the finished capability map. Call this exactly once, when exploration is complete.",
  strict: true,                          // top-level on the tool — NOT on tool_choice
  input_schema: {
    type: "object",
    properties: { /* … generated from the Zod schema … */ },
    required: ["states", "transitions", "capabilities", "frontier"],
    additionalProperties: false,         // required by strict mode
  },
};
```

`strict: true` guarantees the tool input validates against that schema exactly. We still run it through Zod on receipt, because the schema in the tool definition and the schema in `packages/core/schema` must be provably the same object, and a Zod parse is how we prove it.

When a ceiling is reached before the model has emitted, the harness makes **one** final call with the choice pinned:

```ts
const closing = await client.messages.create({
  model: FORGE_MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  output_config: { effort: "low" },       // it is summarising work already done
  tools: [emitCapabilityMap],
  tool_choice: { type: "tool", name: "emit_capability_map" },   // forced
  messages: [...transcript, {
    role: "system",
    content: "Budget exhausted. Emit the capability map for what you have explored so far. " +
             "Set frontier.haltReason accurately. Do not explore further.",
  }],
});
```

That mid-conversation `{ role: "system" }` message is the right channel for an operator instruction arriving mid-loop: it carries operator authority, and unlike editing the top-level `system` field it **does not invalidate the cached prefix**. It is supported on Opus 5, must follow a user message, and must be either last or followed by an assistant turn — all true here, since the previous entry is a tool-result user message.

---

## 3. The five call sites

| # | Call site | Effort | `max_tokens` | Mechanism | Cadence | Fallback |
|---|---|---|---|---|---|---|
| 1 | **Explore** | `medium` | 2 000 / turn | terminal tool | ≤ 8 turns per session | structural breadth-first crawl |
| 2 | **Plan** | `high` | 8 000 | terminal tool | 1 per capability per round | template plan from affordances |
| 3 | **Critique** | `high` | 6 000 | `parse()` | 1 per plan | deterministic structural critic |
| 4 | **Triage** | `xhigh` | 2 000 | `parse()` | ≤ 1 per novel failure signature | deterministic pre-classifier |
| 5 | **Adjudicate** | `high` | 1 000 | `parse()` | ≤ 1, ambiguous band only | `ESCALATE` |

Effort is tiered by how much the answer's *correctness* matters relative to its cost. Exploration is a choice among visible options and recovers from a bad one by exploring more; a misclassified failure is the mistake this entire project exists to prevent, so Triage runs at `xhigh` and is the one call site where we would spend `max` without arguing about it.

### 3.1 Explore → `ExplorationDecision`

Input: the current state's snapshot, the unvisited frontier (capped at 40 affordances), the states already known, the remaining budget. Output: which affordances to exercise next and why, or the terminal `emit_capability_map`.

The model chooses *where to look*. It does not perceive, does not compute signatures, and does not decide what is destructive — all three are deterministic ([08](08-perception-layer.md)).

### 3.2 Plan → `TestPlanDraft`

```ts
export const TestPlanDraft = z.object({
  scenarios: z.array(z.object({
    id: z.string().regex(/^SC-\d{3,}$/),       // reuse an existing id, or take the next
    title: z.string().min(5),
    class: ScenarioClass,                       // happy | negative | boundary | error_state
    priority: Priority,
    priorityReason: z.string().max(120),
    preconditions: z.array(z.string()),
    expectedOutcome: z.string().min(5),
    steps: z.array(z.object({
      kind: StepKind,
      targetIntent: z.string().min(3).max(160),
      stateId: z.string(),                      // MUST exist in the subgraph — FR-204
      affordanceRef: z.string().nullable(),     // MUST exist in that state — I-13
      locatorStrategy: z.enum(["role_name","label","placeholder","text","test_id","url"]),
      locatorArgs: z.record(z.string()),
      input: z.string().nullable(),
    })).min(1),
  })).min(3),
  rationale: z.string().max(600),
});
```

> **The model never emits a locator string.** It emits a *strategy plus arguments*; the compiler turns `{strategy:"role_name", args:{role:"button", name:"Place order"}}` into `getByRole('button', { name: 'Place order' })`. This makes the locator ladder (`FR-404`) mechanically enforceable, prevents malformed selectors, and closes the code-injection path in `NFR-5` — the model produces data, never code.

### 3.3 Critique → `SemanticGaps`

Input: the plan, the capability subgraph, the deterministic structural score **already computed**, and the PRD sections when supplied. Output: gaps in the brief's three classes, each with a severity and a suggested scenario.

The structural score is computed *before* the call and included in the prompt, for the same reason the pre-classification is included in Triage: we want the model to *add* semantic judgement to arithmetic it can see, not to invent a number. `CoverageAssessment.score` is arithmetic in both the model and no-model paths; only the gap list changes.

### 3.4 Triage → `DiagnosisDraft`

Input: the error code and message, the DOM delta summary, the fingerprint, the unscored candidates, console and network deltas against the baseline, and **the deterministic pre-classification**.

The model is asked to agree, refine, or dissent with a stated reason — dissent is logged as a signal. **If `preClassification.final === true` (a veto fired), the call is skipped entirely.** No model output can unblock a veto (`FR-604`).

### 3.5 Adjudicate → `Adjudication`

```ts
export const Adjudication = z.object({
  preferredCandidateId: z.string().nullable(),   // null ⇒ escalate to a human
  confidence: Confidence,
  reasoning: z.string().max(300),
  risks: z.array(z.string()).max(3),
});
```

Called only when the top candidate scores in `[0.65, 0.85)` or the top two are within 0.05. Its output can only **lower** the outcome. It cannot promote a candidate above the auto-heal gate — ceilings are set by arithmetic, and the model is permitted to be more cautious than the arithmetic, never less.

---

## 4. Prompt caching — the lap shell

Render order is `tools` → `system` → `messages`, and caching is a **prefix match**: any byte change anywhere in the prefix invalidates everything after it.

The Capability Lap makes this unusually easy to exploit, because every lap sends the same three things before it sends anything lap-specific:

```
[ tools           ]  the agent's tool set — a frozen, deterministically ordered array
[ system          ]  the frozen role prompt + the output contract            ← breakpoint 1
[ shell           ]  base URL, auth state, conventions, plan format          ← breakpoint 2
──────────────────── everything above is identical on every lap ────────────────────
[ capability      ]  this lap's subgraph, gaps carried from the Critic, budget
```

Two breakpoints, both `cache_control: { type: "ephemeral" }`, out of the four allowed per request. From lap 2 onward the entire prefix is a cache read at roughly a tenth of the input price — and that is the arithmetic behind ADR-012's hidden assumption A2 (*that a fresh context per lap costs less than it saves*).

**Three things that silently drop the hit rate to zero**, each of which is also a determinism smell:

- a timestamp or a session id interpolated into the system text — put it in the user message;
- unsorted JSON keys in a serialised bundle — use a canonical stringifier;
- a tool array whose order varies between calls.

**Verify, do not assume.** `usage.cache_read_input_tokens` is the only proof. If it is zero across repeated laps, something in the prefix is varying — find it before the freeze. And note the floor: the minimum cacheable prefix is model-dependent (512–4096 tokens) and a shorter prefix **silently does not cache at all**, so a system prompt trimmed for elegance can quietly cost more than a longer one.

Default TTL is 5 minutes, which comfortably covers back-to-back laps. For eval loops that run the same fixtures repeatedly, `cache_control: { type: "ephemeral", ttl: "1h" }` on breakpoint 1 keeps the shell warm across a whole working session.

---

## 5. The resilience ladder

```
attempt 1  → the call
   ├─ ok                          → return
   ├─ schema validation failed     → attempt 2, with the Zod issues appended
   ├─ refusal (HTTP 200)           → server-side fallback already ran; if it still
   │                                 refuses → deterministic path
   ├─ RateLimitError (429)         → one retry after `retry-after`, then deterministic
   ├─ APIConnectionError           → deterministic immediately (the venue wifi is gone)
   └─ timeout > 20 s               → abort, deterministic
attempt 2  → the same call, with a repair instruction
   ├─ ok                          → return, tag source "llm", log `repairUsed`
   └─ anything else               → deterministic, tag source "deterministic"
```

Repair instruction:

```
Your previous response failed schema validation with:
{issues}
Return ONLY a value matching the schema. Do not explain the error.
```

Error handling is a **most-specific-first chain**, never one broad catch: `Anthropic.BadRequestError` → `AuthenticationError` → `RateLimitError` → `APIError` → `APIConnectionError`. A single `catch (APIError)` conflates retryable (429, 5xx, connection) with non-retryable (400, 404) and turns a transient blip into a demo-day fallback.

**`repairUsed` is instrumented from the first call**, because the repair-retry count is the earliest signal that structured output is unreliable — ADR-011's hidden assumption A3, and the cheapest one to falsify.

**Rehearsal `R-2` runs the entire demo with `ANTHROPIC_API_KEY` unset.** If the demo does not survive that, it is not finished. The dashboard shows an amber `DETERMINISTIC MODE` chip so we are never accidentally claiming reasoning we did not do — and saying *"the fallback engaged and the verdicts are identical"* out loud is a stronger moment than pretending nothing happened.

---

## 6. What we deliberately do not use

| Feature | Why not, for this build |
|---|---|
| **Task budgets** (`output_config.task_budget`, beta) | It gives the model a token ceiling it can pace itself against — genuinely well suited to the Explorer loop. But it is advisory, it requires streaming, and its 20 000-token minimum is larger than a whole exploration turn. Our ceilings must be *enforced counters* (`ADR-008`), and a counter we wrote is a counter we can point at. **Flip trigger:** if the Explorer starts running out of budget mid-thought rather than mid-plan, add it *alongside* the counters, never instead of them. |
| **The SDK tool runner** | See [06 §2.2](06-agent-contracts.md). Same reason: the ceilings are the auditable part. |
| **Streaming** | Every output here is small (≤ 8 000 tokens). Streaming is required above ~16 000 to dodge HTTP timeouts; we are nowhere near it. The dashboard streams *events*, not tokens (`FR-504`). |
| **Batch API** | 50% cheaper and asynchronous. The whole product is a live pipeline; nothing here can wait for a batch window. |
| **Server tools (web search / fetch)** | The agent's world is the target application. Anything that reaches outside it is a source of non-determinism and a security surface for no gain. |

---

## 7. Cost and telemetry (`NFR-8`)

Per call, logged: `callSite`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `effort`, `latencyMs`, `repairUsed`, `estimatedUsd`. Totalled onto `Session.usage` and shown on the report.

At $5 / $25 per MTok, a 10-capability session:

| Call site | Calls | In (uncached) | In (cached) | Out | Per call | ≈ total |
|---|---|---|---|---|---|---|
| Explore | 8 | 2k | 3k | 0.8k | $0.032 | $0.25 |
| Plan | 12 | 2k | 5k | 2.0k | $0.063 | $0.75 |
| Critique | 12 | 1k | 5k | 1.2k | $0.038 | $0.45 |
| Triage | 3 | 5k | 4k | 0.5k | $0.040 | $0.12 |
| Adjudicate | 0–1 | 1k | 2k | 0.3k | $0.014 | $0.02 |
| | | | | | **total** | **≈ $1.60** |

Arithmetic: uncached input at $5/MTok, cache reads at roughly a tenth of that, output at $25/MTok. **Output tokens include thinking tokens**, which is why `effort` — not the model id — is the cost lever this build actually pulls (§1).

That lands inside the $2.00 envelope of `NFR-8` and `Session.budget.maxUsd`, but not by a comfortable margin, and it assumes the cache is working. Two consequences we act on rather than hope about: §4 ends with *"verify, do not assume"*, and `pnpm forge doctor` runs a pre-flight `client.messages.countTokens()` on the lap shell to confirm the prefix clears the minimum cacheable length **before** the demo rather than during it. If the cache is cold, the same session costs roughly $2.60 and the budget guard ends it `COMPLETED_PARTIAL` — which is the correct behaviour, and also exactly the measurement that would trigger the `W-2` reconsideration in §1.

---

## 8. Pitfalls — verified against the current API

| Pitfall | Consequence | Correct form |
|---|---|---|
| `thinking: { type: "enabled", budget_tokens: N }` | **400** on Opus 5 | `thinking: { type: "adaptive" }` |
| `temperature` / `top_p` / `top_k` | **400** on Opus 5 | Removed — control depth with `effort` |
| Assistant-message prefill | **400** on Opus 5 | Structured outputs, or a system instruction |
| Top-level `output_format` | Deprecated | `output_config: { format: … }` |
| `effort` at the top level | Silently ignored | Inside `output_config` |
| `strict: true` placed on `tool_choice` | Not a thing | Top-level on the **tool definition**, with `additionalProperties: false` and `required` |
| Date-suffixed model id (`claude-opus-5-2026xxxx`) | Invalid id | `claude-opus-5`, exactly |
| Reading `res.content` before checking `stop_reason` | Silent empty result on a refusal | Guard the refusal first |
| Reading `stop_details` on a normal stop | It is `null` for every non-refusal stop reason | Guard before reading |
| Assuming `parsed_output` is non-null | Runtime crash | Guard, then fall back |
| One broad `catch (APIError)` | Retryable and fatal conflated | Most-specific-first chain |
| Editing top-level `system` mid-loop | Invalidates the whole cached prefix | Append a `{ role: "system" }` message instead |
| String-matching a serialised tool input | Breaks on escaping differences | Always `JSON.parse` |
| A system prompt under the minimum cacheable length | Caches nothing, silently | Check with `countTokens` in `doctor` |

---

## 9. Determinism — say this out loud

Model calls are **not** bit-deterministic, even at a fixed effort. The `NFR-1` guarantee covers **verdicts**, not prose:

- `Diagnosis.kind` is deterministic, because the pre-classifier and the vetoes are deterministic and take precedence.
- `CoverageAssessment.score` is deterministic, because the structural score is arithmetic over stored inputs.
- `HealCandidate.score` is deterministic, because scoring is pure arithmetic with no model involvement.
- `Capability.priorityRank` is deterministic, because ranking is a pure function of the map (`I-17`).
- `Diagnosis.explanation` and `Gap.why` vary between runs. That is fine — they are presentation.

If a judge asks *"is this reproducible?"*, the honest and stronger answer is: **"The decisions are. The wording isn't. We put the decisions in code precisely so we could promise that."**

---

## 10. Environment

```bash
ANTHROPIC_API_KEY=sk-ant-...        # or `ant auth login` — a bare `new Anthropic()` finds a profile
FORGE_MODEL=claude-opus-5
FORGE_LLM_ENABLED=true              # false ⇒ force deterministic mode (rehearsal R-2)
FORGE_LLM_TIMEOUT_MS=20000
FORGE_ALLOWED_HOSTS=localhost,127.0.0.1
```

If `ANTHROPIC_API_KEY` is unset, run `ant auth status` before concluding there are no credentials — the SDK also resolves an `ant auth login` profile with a bare `new Anthropic()`. `pnpm forge doctor` checks the key resolves, the model id matches the freeze manifest, and the lap shell clears the minimum cacheable prefix length.

---

## 11. Related documents

- Which stage owns which call site → [06 · Agent Contracts](06-agent-contracts.md)
- The loop the terminal tool terminates → [06 §2](06-agent-contracts.md)
- Why the model never drives the browser → [ADR-002](../decisions/ADR-002-llm-role.md), refined by [ADR-011](../decisions/ADR-011-agent-topology.md)
- The deterministic paths every fallback lands on → [11 · Coverage Critic](../03-algorithms/11-coverage-critic.md), [13 · Triage & Healing](../03-algorithms/13-triage-and-healing.md)
