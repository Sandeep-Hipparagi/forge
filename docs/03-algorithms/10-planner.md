# 10 · Planner

> **The Planner is the only stage allowed to be imaginative, and the only stage whose imagination is checked twice** — once by grounding validation before it leaves the loop ([§4](#4-grounding-is-validated-not-requested)), and once by the Critic before a line of code is written ([11](11-coverage-critic.md)).
> **This document owns:** the planning prompt contract, the grounding validator, the scenario-identity merge, the `P0`…`P3` assignment rule, and the Markdown renderer.
> **Governing decision:** [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md) — the plan is the truth; `.spec.ts` is a projection of it.

---

## 1. The stage in one sentence

Given one capability and the subgraph the Explorer observed for it, produce scenarios a QA lead would recognise as their own work — each step anchored to something that was actually seen on the actual application.

That last clause is the whole difficulty. A model asked to write tests for a checkout will happily produce a beautiful plan that references a *"Continue to payment"* button which does not exist. The industry name for this is a hallucination; the practical name is a test suite that will not compile. `FR-204` exists to make it structurally impossible, and §4 is how.

---

## 2. What one planning call is given

The lap packet. Nothing else — not the other capabilities, not the other laps, not the session's history ([ADR-012](../decisions/ADR-012-capability-lap.md)).

```
[ tools    ]  the Planner's least-privilege set — read-only snapshot, getStateGraph,
              getPlan, getPrdSection                                        (06 §3)
[ system   ]  the frozen role prompt and the output contract   <- cache breakpoint 1
[ shell    ]  base URL, auth state, step vocabulary, plan format <- cache breakpoint 2
──────────── identical on every lap; everything below is this lap's ────────────
[ capability ]  name, description, entry state, exit conditions, risk factors
[ subgraph   ]  this capability's states, transitions and affordances
[ carried    ]  the Critic's gaps from the previous round, when round > 0
[ prd        ]  the PRD sections matched to this capability, when supplied
[ intent     ]  the user's natural-language intent, when supplied
```

### 2.1 The subgraph, and its size budget

```ts
type CapabilitySubgraph = {
  states: Array<{ id; signature; url; title; snapshotYaml }>;   // full snapshot, not a summary
  transitions: Transition[];
  affordances: Affordance[];      // including observedNotExercised ones, with their reasons
  entryStateId: string;
  exitConditions: string[];
};
```

**Budget: 24 KB.** A capability of 5 states at 2–4 KB of snapshot each fits comfortably. When it does not — a cluster that survived the split pass at 8 states of dense forms — states are dropped from the *end of the discovery order*, never from the entry, and the packet records `subgraphTruncated: true` so the Critic's structural denominator can be read correctly.

**The `observedNotExercised` affordances are included on purpose.** The Planner can see that *Cancel order* exists and that the Explorer declined to press it. It may plan a scenario for it, marked `plannedNotGenerated` (§8) — which turns a safety limit into a documented gap rather than a silence.

---

## 3. The prompt contract (call site 2)

| | |
|---|---|
| Mechanism | Terminal tool `emit_test_plan`, `strict: true` ([07 §2.2](../02-architecture/07-llm-integration.md)) |
| Effort | `high` · `max_tokens` 8 000 |
| Ceilings | 12 tool calls · 4 model turns · 20 s |
| Output | `TestPlanDraft` ([07 §3.2](../02-architecture/07-llm-integration.md)) → validated into `TestPlan` |
| Fallback | The template plan of §9 |

The system prompt says four things, and they are the four things that make the difference between a plan and a wish:

1. **Every step must cite a `stateId` and an `affordanceRef` from the subgraph.** A step that cannot will be dropped by the validator, not fixed for you.
2. **Emit a locator *strategy plus arguments*, never a locator string.** `{strategy: "role_name", args: {role: "button", name: "Place order"}}`. The compiler writes the code ([12 §3](12-generator.md)).
3. **Cover four classes** — `happy`, `negative`, `boundary`, `error_state`. If a class genuinely does not apply to this capability, say so in `rationale`; do not invent a scenario to fill the slot (`FR-203`).
4. **A scenario is a user's intention, not a click log.** Its `expectedOutcome` must be a claim about the product, checkable by an assertion.

### 3.1 What the prompt deliberately does not contain

- **No examples of good scenarios for a shop.** Few-shot examples of e-commerce flows produce e-commerce flows on a banking app. The subgraph is the only domain input.
- **No instruction not to hallucinate.** Asking politely is not a control; §4 is a control.
- **No priority guidance beyond "state your reason".** The deterministic ceiling in §6 will clamp it anyway, so instructing the model here would only teach it to argue with arithmetic.
- **No coverage target.** Telling the Planner the floor is 0.70 teaches it to pad the plan up to 0.70. The Critic's score is computed over *distinct* affordances precisely so padding does not work ([11 §7.3](11-coverage-critic.md)), and the cheapest way to keep that true is not to mention the number.

---

## 4. Grounding is validated, not requested

`FR-204`, `TG-5a`, `I-13`. This runs **after** the loop returns, on the way from `TestPlanDraft` to `TestPlan`.

```ts
// packages/core/schema/grounding.ts — pure
export function ground(draft: TestPlanDraft, sub: CapabilitySubgraph): GroundingResult;

type GroundingResult = {
  plan: TestPlan;                                  // only surviving scenarios
  dropped: Array<{ scenarioId: string; step: number; reason: DropReason }>;
  retry: boolean;                                  // fewer than 3 scenarios survived
};
```

Per step, in order:

| # | Check | On failure |
|---|---|---|
| 1 | `stateId` exists in `subgraph.states` | Drop the **scenario**, reason `UNKNOWN_STATE` |
| 2 | `affordanceRef` exists in that state's affordances (`null` permitted only for `kind: "navigate"`) | Drop the **scenario**, reason `UNKNOWN_AFFORDANCE` |
| 3 | The affordance's `role` is compatible with the step `kind` (`fill` needs a textbox; `select` needs a combobox) | Drop the **scenario**, reason `KIND_MISMATCH` |
| 4 | The step order is contiguous from 0 and the first step's `stateId` is reachable from the capability's entry state | Drop the **scenario**, reason `UNREACHABLE_START` |
| 5 | The scenario contains at least one assertion step (`FR-201`) | Drop the **scenario**, reason `NO_ASSERTION` |

**A failed step drops its whole scenario, not just the step.** A scenario missing its third step is not a shorter scenario, it is a different and probably meaningless one — and a half-plan that still compiles is worse than an absent one, because it looks like coverage.

If fewer than three scenarios survive, the round is retried once with the drop reasons appended to the conversation. A second failure returns the template plan of §9 with `source: "agent"` replaced by `"deterministic"`, and the lap proceeds to the Critic, which will have plenty to say.

Every drop is an event (`generate.dropped` is the Generator's; the Planner's are carried in the `plan.drafted` payload) and appears in the report. A step the Planner invented and we deleted is a fact about this run, not an embarrassment to hide.

---

## 5. Scenario identity across rounds (`FR-205`, `I-14`)

Re-planning that renumbers everything destroys the demo beat it exists to produce. If round 0 said `SC-001 … SC-003` and round 1 says `SC-001 … SC-006` with different meanings behind the same ids, nobody can read the diff — and the diff *is* `S-2`, the visible moment where the orchestrator changes its mind.

### 5.1 The identity key

```ts
identityKey(s: Scenario) = sha256([
  s.class,
  normalise(s.title),                                  // lowercase, strip punctuation and stopwords
  ...s.steps.map(st => `${st.kind}:${normalise(st.targetIntent)}`),
].join(" ")).slice(0, 16);
```

### 5.2 The merge

```
for each scenario in the new round:
    exact key match against a previous round      -> reuse that id
    else similarity >= 0.80 against a previous    -> reuse that id     (§5.3)
    else                                          -> allocate the next SC-nnn from the lap counter
```

Ids are allocated from a per-lap counter that **never reuses a number**, even when a scenario disappears. `SC-004` deleted in round 1 does not come back as something else in round 2; the report shows it as dropped between rounds, with the reason.

### 5.3 The similarity measure

`0.6 · jaccardTokenSet(titles) + 0.4 · stepSequenceRatio`, where `stepSequenceRatio` is the length of the longest common subsequence of `(kind, normalise(targetIntent))` pairs over `max(len_a, len_b)`. The same two lexical primitives the healing scorer uses ([13 §4.1](13-triage-and-healing.md)), for the same reason: no embeddings on a path that must work with the model unavailable.

### 5.4 Worked example — Checkout, round 0 → round 1

| Round 0 | Round 1 | Outcome |
|---|---|---|
| `SC-001` Guest checkout with a valid card | *(unchanged)* | key match → **`SC-001`** |
| `SC-002` Checkout applies tax to the total | `SC-002` Checkout applies tax and shipping to the total | similarity 0.84 → **`SC-002`** kept, marked changed |
| `SC-003` Signed-in checkout reuses the saved address | *(unchanged)* | key match → **`SC-003`** |
| — | Declined card shows an error and does not place the order | new → **`SC-004`** |
| — | Coupon code below the minimum spend is rejected | new → **`SC-005`** |
| — | Empty cart cannot reach the payment step | new → **`SC-006`** |

The dashboard renders exactly this table. Three rows unchanged, one refined, three added in response to named gaps — that is the Critic doing its job, in a form a judge can read in four seconds.

---

## 6. Priority (`FR-206`)

The model proposes a priority and a reason under 120 characters. A deterministic rule computes a **ceiling**, and the ceiling wins.

```
ceiling(scenario, capability) =
  P0   capability.risk.score >= 0.70  AND  scenario.class == "happy"
  P0   the scenario touches an affordance matching the money/PII lexicon (09 §6.1)
  P1   capability.risk.score >= 0.70  (any other class)
  P1   capability.risk.score >= 0.45  AND  scenario.class == "happy"
  P2   capability.risk.score >= 0.45  (any other class)
  P3   otherwise

priority = weaker(ceiling, modelProposed)   // P0 > P1 > P2 > P3 in strength;
                                           // the weaker of the two wins, so the ceiling holds
```

**The model may argue a scenario down, never up.** This mirrors `adjudicate()`, which may only lower a healing outcome ([07 §3.5](../02-architecture/07-llm-integration.md)), and it exists for the same reason: a persuasive model should never be able to raise the stakes of its own output. If everything can be argued into `P0`, the priority field is decoration.

`priorityReason` is stored verbatim and shown in the report; when the ceiling overrode the model, the stored reason is the ceiling's — *"P0: capability risk 0.88, happy path"* — so the report never explains a priority with an argument that did not decide it.

---

## 7. One source, two renderings (`FR-202`, ADR-006)

JSON is canonical. Markdown is a **pure function of it**, written to `plans/<capability-slug>-r<round>.md` and hashed as `PLAN` evidence.

```ts
// packages/core/compile/src/plan-md.ts
export function renderPlan(plan: TestPlan, cap: Capability): string;   // pure, deterministic
```

Rules that keep the acceptance criterion (*regenerating from JSON is byte-identical*) true:

- Fields render in schema declaration order. Never object key order, which is not a contract.
- **No timestamps, no ids that vary between runs, no counts computed at render time.** Everything printed comes from the document.
- One trailing newline. LF only. No trailing spaces.
- Scenarios ordered by `(priority, id)`, not by array position.

### 7.1 The rendered form

```markdown
# Checkout — Test Plan (round 1)

**Capability.** Guest and signed-in purchase, from cart to order confirmation.
**Risk.** 0.881 — money 1.00 · mutation 1.00 · auth 0.60 · centrality 0.72 · density 0.83
**Entry state.** st_01j9x2k5 · /checkout
**Exit conditions.** Order confirmation reached · Returns to Cart

## SC-001 · Guest checkout with a valid card — `happy` · **P0**
> P0: capability risk 0.88, happy path

**Preconditions**
- Cart contains one item
- No user is signed in

**Steps**
| # | Action | Intent | State | Affordance |
|---|---|---|---|---|
| 1 | navigate | open the checkout page | st_01j9x2k5 | — |
| 2 | fill | enter the full name | st_01j9x2k5 | e3 |
| 3 | fill | enter the card number | st_01j9x2k5 | e6 |
| 4 | click | submit the order | st_01j9x2k5 | e9 |
| 5 | assertText | the order is confirmed | st_01j9x3b1 | e12 |

**Expected outcome.** An order confirmation is shown with an order number.
```

A QA lead can review that without tooling, which is the entire point of `FR-202`. And because it is generated, it cannot drift from what runs — the failure mode of every hand-maintained test plan in the industry.

---

## 8. Scenarios we plan and deliberately do not generate (`FR-209`)

A scenario whose steps exercise a `destructive: true` affordance on a target the user has **not** marked disposable is emitted with:

```
plannedNotGenerated: true
notGeneratedReason:  "step 4 exercises 'Cancel order', which is deny-listed on a
                      non-disposable target; re-run with --disposable-target to generate"
```

It counts toward the Critic's structural coverage (it is a genuine plan for a genuine flow), it does **not** reach the compiler, and it appears in the report as a known gap with a one-line instruction for closing it. The alternative — silently not planning it — produces a report that claims complete coverage of checkout without ever mentioning that cancellation is untested.

---

## 9. The deterministic fallback (`NFR-2`)

With no model, a template plan is derived from the subgraph alone:

| Generated scenario | Built from |
|---|---|
| **Happy path** | The shortest observed transition path from the entry state to an exit condition, with each `fill` given a type-appropriate valid value and each terminal state given an `assertVisible` on its heading |
| **Negative** | The same path with the first required textbox left empty, expecting the form not to advance (asserted as `assertUrl` unchanged) |
| **Boundary** | The same path with the longest textbox filled to 256 characters |
| **Error state** | Navigation to any observed state whose title or heading matches `/error\|not found\|unavailable\|denied/i`; omitted with a stated reason when none was observed |

It is a weak plan and we say so: `TestPlan` scenarios carry `source: "agent"`, the assessment carries `source: "deterministic"`, and the UI shows the amber `DETERMINISTIC MODE` chip. But it is a *valid, grounded, runnable* plan — every step cites an observed affordance because it was built from observed affordances — and rehearsal `R-2` runs the whole demo on it.

---

## 10. Budgets and limitations

| Operation | p50 | Cap | On cap |
|---|---|---|---|
| Planner loop (call site 2) | 6 s | 20 s / 12 calls / 4 turns | Forced close; the partial draft is grounded and kept |
| `ground()` | 4 ms | 100 ms | pure |
| `merge()` (identity, §5) | 3 ms | 100 ms | pure |
| `renderPlan()` | 6 ms | 200 ms | pure |

| Limitation | Impact | Stated answer |
|---|---|---|
| The plan can only be as good as the map | An unexplored affordance cannot be planned against | The Critic's denominator is the same subgraph, so the *gap* is visible even when the scenario is impossible |
| Multi-capability flows are out of reach | "Sign in, then buy" spans two laps and no single lap sees both | `dependsOn` orders them; a genuine cross-capability scenario is a known limitation of the lap model (ADR-012, cross-capability blindness) |
| Test data is invented | A `fill` value is type-appropriate, not domain-valid | Live validation catches it at generation time and drops the scenario with a reason ([12 §4](12-generator.md)) rather than shipping a red test |
| Similarity-based id reuse can merge two genuinely different scenarios | A confusing diff in one row | Threshold 0.80 is deliberately high; the alternative — renumbering on any edit — makes *every* row confusing |

---

## 11. Related documents

- What grounds the plan → [09 · Exploration & Prioritisation](09-exploration-and-prioritisation.md)
- What checks it before code is written → [11 · Coverage Critic](11-coverage-critic.md)
- What turns it into TypeScript → [12 · Generator](12-generator.md)
- The draft schema and the terminal tool → [07 §2.2, §3.2](../02-architecture/07-llm-integration.md)
- The stored shapes → [05 §2.5](../02-architecture/05-data-model.md)
- Why the plan and not the code is patched → [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md)
