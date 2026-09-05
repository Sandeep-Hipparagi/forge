# 09 · Exploration & Prioritisation

> **The stage that makes the first MUST true.** The brief opens with *"explore the application"*, and everything downstream is a projection of what this stage saw. A capability the Explorer missed is a capability nobody tests, nobody scores, and nobody is told about.
> **This document owns:** the login detector, the frontier loop, the clustering algorithm, and the risk-ranking function `rank()`.
> **It does not own:** the snapshot format, the state-signature algorithm, or the deny-list constant. Those are [08 · Perception Layer](../02-architecture/08-perception-layer.md).

---

## 1. What this stage must answer

Three questions, in order, from nothing but a URL:

| # | Question | Answered by | Determinism |
|---|---|---|---|
| 1 | **How do I get in?** | The login detector (§2) | Fully deterministic; the model is a last resort |
| 2 | **Where do I go next?** | The frontier loop (§3) | Deterministic scaffold, one model call per batch |
| 3 | **What does this application *do*?** | Clustering (§5) + ranking (§6) | Clustering is deterministic plus a naming call; ranking is pure arithmetic (`I-17`) |

Output is one `CapabilityMap` ([05 §2.4](../02-architecture/05-data-model.md)) and a risk-ordered backlog. Guard `TG-2` needs at least one capability and a signature on every state; guard `TG-3` needs the ordering to be reproducible.

**The stage never fails.** A target that refuses to authenticate, a crawl that halts on its first budget, a single page with three buttons — each of those is a smaller map, not an error. `TG-2` degrades a zero-capability map into one synthetic capability covering the entry state and the session continues. There is no input for which the correct behaviour is `ERROR`.

---

## 2. Authentication (`FR-101`, `FR-102`, `FR-003`)

### 2.1 Detection is deterministic and runs before any model call

Login is too load-bearing to be probabilistic. The detector is a pure function over one snapshot plus the DOM's input types.

```ts
// packages/perception/src/login.ts
export function detectLoginForm(snap: AccessibilitySnapshot, dom: DomFacts): LoginForm | null;

type LoginForm = {
  identityRef: string;      // e42
  passwordRef: string;
  submitRef: string;
  scopeRef: string | null;  // the enclosing form, when there is one
  confidence: number;       // 0..1
};
```

Three signals, evaluated in this order:

| # | Signal | Rule |
|---|---|---|
| 1 | **The password field** | An input of `type="password"`. Required — no password input, no login form. If there are two, this is a *registration* or *change-password* form, not a login: return `null`. |
| 2 | **The identity field** | The nearest preceding textbox whose `autocomplete`, `name`, `id`, accessible name or placeholder matches `/user\|e-?mail\|login\|phone\|mobile\|account\|employee\|member/i`. If none matches, fall back to the nearest preceding textbox in the same scope. |
| 3 | **The submit control** | A `button` or `input[type=submit]` inside the same form; failing that, the only enabled button in the same landmark; failing that, the button whose accessible name matches `/sign ?in\|log ?in\|continue\|submit\|enter/i`. |

```
confidence = 1.00   all three found inside one <form>
           = 0.80   all three found, same landmark, no <form> element
           = 0.60   all three found, different scopes
           = 0.00   any one missing
```

`confidence >= 0.60` proceeds. Below that, **and only below that**, the model is shown the snapshot once and asked whether this page is an authentication gate and which refs to use — the single place in this stage where auth touches a model. With no model available the session proceeds unauthenticated and says so.

> Three structurally different login pages, one detector, zero configuration — that is the `FR-101` acceptance criterion, and it is checkable against three fixture snapshots in a unit test with no browser at all.

### 2.2 Knowing whether it worked

Submitting a form is easy. Deciding whether you are *in* is where naive crawlers get this wrong and then spend ninety seconds exploring the logged-out application.

The verdict is structural, not textual:

```
authenticated = signature(after) !== signature(before)
             && ( no password input remains
                  || an affordance matching /sign ?out|log ?out|my account|profile/i appeared )
```

| Observation | Verdict | Action |
|---|---|---|
| Signature changed, password field gone | **Authenticated** | Persist `storageState`, continue |
| Signature changed, password field remains, an `alert`/`status` role appeared | **Credentials rejected** | Retry once, then continue unauthenticated |
| Signature unchanged | **Nothing happened** | Retry once via `press("Enter")`, then continue unauthenticated |
| Navigation left the origin (SSO) | **Out of scope** | Record, return to the entry URL, continue unauthenticated (`FR-109`) |

Every unauthenticated outcome sets `CapabilityMap.authenticated = false` and writes the reason into the report. Half a map, honestly labelled, beats a full map of the login screen.

### 2.3 `storageState` — captured once, used everywhere (`FR-102`)

```
artifacts/sessions/<sessionId>/.auth/state.json      <- captured here, gitignored
        |
        +-- every later navigation in this session reuses the same context
        +-- the emitted project gets a setup project, not this file  (12 §6)
```

The emitted suite does **not** ship that file. It ships an `auth.setup.ts` project that performs one login from `process.env.FORGE_USER` / `FORGE_PASS` and writes its own `.auth/state.json`; every generated spec then declares `storageState` and performs **zero** interactive logins. That is exactly what `FR-102`'s acceptance criterion asks for, and it is also what keeps the password out of the emitted suite (`FR-006`) — the credential lives in the environment, never in a file we wrote.

`storageState` contains live session cookies. It is treated as a secret: never attached as evidence, redacted from event payloads, and excluded from the artifacts bundle a judge downloads.

### 2.4 Session expiry mid-crawl

If a snapshot mid-crawl matches the login form again, the session expired. Re-authenticate once from the stored credentials, restore the frontier, continue. A second expiry ends exploration with `haltReason: "TIME_BUDGET"` and a recorded note — an application that logs us out twice inside ninety seconds is not one we can map within the budget, and saying so is more useful than looping.

---

## 3. The frontier loop (`FR-103`, `FR-107`)

### 3.1 The division of labour

**The model has the tools; the driver has the loop.**

The Explorer is a `runAgentLoop()` agent with browser tools ([06 §3](../02-architecture/06-agent-contracts.md)), but the walking is done by deterministic code between model turns. One *batch* is one model call: the driver presents the frontier, the model chooses which affordances are worth exercising and says why, and the driver expands each choice — click, snapshot, signature, affordances, record the transition — with no model involvement at all.

| | Counted against | Typical |
|---|---|---|
| Model turns | 8 model turns | 5–8 batches |
| The model's own tool calls (targeted probes, orientation snapshots) | 40 tool calls | 10–25 |
| Driver expansions | the **state budget** and the wall clock, *not* the call ceiling | 20–40 |

That split is why a 40-state application is mappable inside eight model turns. It is also why the fallback is cheap: remove the model and the driver still expands the frontier, in the pre-sorted order of §3.3 rather than a chosen one.

### 3.2 The loop

```ts
// packages/agents/explorer/src/frontier.ts — the shape, not the implementation
async function explore(input: ExplorerInput, ctx: AgentContext): Promise<CapabilityMap> {
  await navigate(input.url);
  if (input.credentials) await authenticate(input.credentials);   // §2

  const states = new Map<Signature, State>();
  const frontier: FrontierItem[] = [];
  admit(await observe());                     // snapshot -> signature -> affordances -> frontier

  while (frontier.length && withinBudget()) {
    const batch  = frontier.splice(0, FRONTIER_BATCH);           // <= 40, pre-sorted (§3.3)
    const chosen = await chooseBatch(batch, states, ctx);        // <- call site 1, or the fallback

    for (const item of chosen) {                                 // driver expansion, no model
      const from = states.get(item.fromSignature)!;
      await restore(from);                                       // navigate, or replay a path
      const act = await exercise(item.affordance);               // deny-list enforced in the tool
      if (!act.ok) { record(item, act.error); continue; }        // ACTION_DENIED / OFF_ORIGIN
      const to = admit(await observe());
      recordTransition(from, item.affordance, to, act.action);
    }
  }
  return assemble(states, transitions, cluster(...), frontierStats());   // §5
}
```

`admit()` is where deduplication happens: compute the signature ([08 §3](../02-architecture/08-perception-layer.md)); if it is already known, increment `visitedVariants` and admit **only** affordances not already on that state's frontier; otherwise create the `State` and admit all of them.

`restore()` prefers a direct `navigate()` to the state's URL and falls back to replaying the shortest recorded path from the entry state. Restoring by URL is a heuristic that fails on wizard-style flows; when the post-restore signature does not match, the item returns to the frontier once and is then dropped with a stated reason rather than being exercised from the wrong place.

### 3.3 What is admitted, and in what order

Never admitted:

| Excluded | Reason | Recorded as |
|---|---|---|
| `destructive: true` affordances | `FR-106`, `NFR-6` — a crawler that presses *Delete* is an incident | `observedNotExercised`, reason `DENY_LIST` (`I-20`) |
| Off-origin links | `FR-109` | `observedNotExercised`, reason `OFF_ORIGIN` |
| `enabled: false` | Nothing to learn | `observedNotExercised`, reason `DISABLED` |
| Anything on a state discovered at or past the state budget | `FR-107` | `observedNotExercised`, reason `STATE_BUDGET` |

Admitted items are pre-sorted by a deterministic value heuristic, and this sort **is** the no-model fallback:

```
value = 0.40 · isNavigational      (link, tab, menuitem — reveals new states)
      + 0.25 · isFormSubmit        (non-destructive submit — reveals outcome states)
      + 0.20 · nameInformative     (accessible name is non-empty and not an icon glyph)
      + 0.15 · (1 - stateFanoutSoFar / MAX_FANOUT)     (spread, do not drill)

tie-break: (stateId, ref) ascending — stable, so two runs order identically
```

### 3.4 Budgets and the four halt reasons (`FR-107`)

| Budget | Default | `haltReason` when it binds |
|---|---|---|
| Frontier empty | — | `EXHAUSTED` |
| States discovered | 40 | `STATE_BUDGET` |
| Wall clock | 90 s | `TIME_BUDGET` |
| Model tool calls / turns | 40 / 8 | `CALL_BUDGET` |

Whichever binds first sets `frontier.haltReason`, and the harness's `FORCED_CLOSE` exit reason maps onto it directly ([06 §2.1](../02-architecture/06-agent-contracts.md)).

> **`haltReason` is a claim-limiter, not a log line.** `EXHAUSTED` licenses the report to say *"we have seen this application"*. `STATE_BUDGET` licenses only *"we have seen this much of it"*, and [14 §4](14-quality-report-and-score.md) is required to say the difference out loud. A crawler that stops early and then reports full coverage of what it happened to see is the specific dishonesty this field exists to prevent.

### 3.5 Call site 1 — `ExplorationDecision`

**Shown:** the known states (signature, url, title, affordance counts — never full snapshots), the batch of at most 40 unvisited affordances with role, accessible name and source state, and the remaining budget. **Returned:** the refs to exercise, in order, with a one-line reason each, plus an optional `stop` flag and its reason.

Not shown, not asked: what is destructive, what the signature is, whether a state is new. All three are computed. The model chooses *where to look*; it never perceives and never decides safety.

**Fallback (`NFR-2`):** take the top `min(6, batch.length)` items by the §3.3 value sort. Exploration proceeds breadth-first — the map comes out a little wider and a little less pointed. `EC-02` asserts this path with the key unset.

---

## 4. Deduplication in practice

The algorithm belongs to [08 §3](../02-architecture/08-perception-layer.md); what matters here is how the loop uses it.

- A revisit increments `visitedVariants` **and contributes new affordances**. Page 2 of a product list is the same state, but if it exposes a *Next* control that page 1 did not, that control joins the frontier.
- A state whose `visitedVariants` passes 20 stops admitting new affordances altogether. At that point it is a list, and the twenty-first variant will not teach us anything the first twenty did not.
- Transitions are keyed on the `(fromState, affordance, toState)` triple and deduplicated on it, so a self-loop is recorded once.

---

## 5. Capability clustering (`FR-105`)

This is where routes become capabilities, and it decides whether the output reads like a sitemap or like a description of a product.

### 5.1 The algorithm

Deterministic, five passes over the state graph:

1. **Strip global navigation.** An affordance whose `(role, accessibleName)` pair appears on 60% or more of states is a header or footer control; its transitions are removed from the clustering graph. *Without this pass every state is one hop from every other state and clustering returns one blob.* It is the single load-bearing line in the algorithm.
2. **Weakly connected components** of the remaining graph become candidate clusters.
3. **Merge** clusters whose entry states share a first route-template segment (`/checkout/*` with `/checkout`).
4. **Split** any cluster above 8 states by second route segment, so *Admin* does not swallow the application.
5. **Attach orphans.** A single-state component joins the cluster that most often transitions into it; failing that it becomes its own capability.

### 5.2 Naming, exit conditions, dependencies

Naming is the second half of call site 1's terminal emit: the model is shown each cluster's route templates, headings and affordance names and returns a `name` and a `description`. It is the only judgement in this section, and it is judgement about *language*, not about structure.

**Fallback naming**, with no model: title-case the longest common route segment, or use the entry state's `<h1>` when the route is `/`. *Checkout* comes out as *Checkout* either way; a cluster at `/s/12/items` comes out as *Items* instead of something better. The map is still valid — only the label is duller.

| Field | Derived how |
|---|---|
| `entryStateId` | The cluster state with the highest in-degree from *outside* the cluster |
| `exitConditions` (`FR-105`, at least one) | Signatures reachable from the cluster that lie outside it, described by their titles; failing that, `"returns to <entry title>"` |
| `dependsOn` (ADR-012 A1) | A cluster whose states are all `authRequired` depends on the cluster containing the login state |
| `stateIds` | The component's states, in discovery order |

### 5.3 Worked example — the reference shop

31 states discovered, `haltReason: EXHAUSTED`.

| Cluster | States | Route templates | Name |
|---|---|---|---|
| c1 | 4 | `/login`, `/forgot`, `/reset/:id` | **Sign-in** |
| c2 | 9 | `/products`, `/products/:id`, `/search` | **Browse & Search** |
| c3 | 3 | `/cart` | **Cart** |
| c4 | 5 | `/checkout`, `/checkout/payment`, `/order/:id` | **Checkout** |
| c5 | 6 | `/account`, `/account/orders`, `/account/addresses` | **Account** |
| c6 | 4 | `/admin`, `/admin/products/:id` | **Admin Catalogue** |

Nine header links (*Home*, *Cart*, *Account*, …) appeared on 28 of the 31 states and were stripped in pass 1. Without that pass all 31 states form one component and the output is a single capability called *Shop* — true, useless, and unrankable.

---

## 6. Risk ranking (`I-17`, `FR-902`)

The backlog order **is** the product. A tool that runs out of budget at 60% has delivered something valuable if it spent that 60% on checkout and sign-in, and something worthless if it spent it on the footer.

### 6.1 The six factors — each computed from the map, none guessed

| Factor | Computation | Range |
|---|---|---|
| `moneyOrPii` | `min(1, lexiconHits / 3)` over accessible names, route templates and input `autocomplete` values, against a unit-tested lexicon: `card, credit, payment, pay, price, total, invoice, billing, iban, cvv, ssn, passport, dob, address, phone, email, password` | 0–1 |
| `dataMutation` | `1.0` when the cluster contains an observed form submit or a non-GET `apiHint`; `0.6` when it has textboxes but no observed submit (deny-listed, therefore unproven); `0.0` when read-only | 0 / 0.6 / 1 |
| `authProximity` | `1.0` all states `authRequired`; `0.6` the cluster contains the auth-boundary transition; `0.0` fully public | 0 / 0.6 / 1 |
| `graphCentrality` | Cluster in-degree from outside, divided by the maximum such in-degree across clusters | 0–1 |
| `affordanceDensity` | Cluster affordance count divided by the maximum across clusters | 0–1 |
| `statedIntent` | Jaccard token overlap between `input.intent` and `name + description`; `0` when no intent was supplied (`FR-005`) | 0–1 |

### 6.2 The function

```ts
// packages/orchestrator/src/prioritise.ts — pure. Same map in, same order out (I-17).
const W = { moneyOrPii: 0.28, dataMutation: 0.22, authProximity: 0.15,
            graphCentrality: 0.15, affordanceDensity: 0.10, statedIntent: 0.10 };

risk = Σ W[f] · factors[f];

sortKey = [ intentMatched ? 0 : 1,      // <- a promotion, not a weight
            -risk,
            name ];                     // final tie-break: alphabetical, so the order is total
```

**Intent is a promotion, not a weight.** `FR-005`'s acceptance criterion is that a capability the user *named* ranks in the top 3. A 0.10 weight cannot guarantee that against a high-risk unnamed capability; a lexicographic promotion can, and it is still a pure function of the inputs. `statedIntent` stays in `RiskFactors` because the report shows the factor breakdown, and hiding the reason a capability was promoted would be the wrong kind of tidy.

The `name` tie-break exists so the ordering is **total**. Two capabilities with identical risk must not swap places between runs; `I-17`'s test calls `rank()` five times over one fixture map and asserts a single identical order.

### 6.3 Worked example — the same six capabilities, no intent supplied

| Capability | money | mutate | auth | central | density | risk | rank |
|---|---|---|---|---|---|---|---|
| **Checkout** | 1.00 | 1.00 | 0.60 | 0.72 | 0.83 | **0.881** | 1 |
| **Account** | 0.67 | 1.00 | 1.00 | 0.48 | 0.61 | **0.792** | 2 |
| **Sign-in** | 0.33 | 1.00 | 0.60 | 1.00 | 0.35 | **0.688** | 3 |
| **Admin Catalogue** | 0.33 | 1.00 | 1.00 | 0.24 | 0.52 | **0.647** | 4 |
| **Cart** | 0.67 | 0.60 | 0.00 | 0.64 | 0.30 | **0.446** | 5 |
| **Browse & Search** | 0.00 | 0.00 | 0.00 | 0.80 | 1.00 | **0.220** | 6 |

Two things a judge should be able to check from this table.

First, **Browse & Search has the most affordances and ranks last.** Density is 10% of the weight precisely so that surface area does not beat consequence — the largest surface in a shop is the part where nothing can go wrong.

Second, had the session carried `intent: "focus on checkout and authentication"`, *Sign-in* would move to rank 2 on the promotion while its risk number stayed 0.688 — and the report shows both the promotion and the unchanged arithmetic, rather than a number that mysteriously moved.

### 6.4 What ranking is not allowed to do

It cannot drop a capability. Everything discovered enters the backlog; the budget decides how far down the list the session gets, and the remainder becomes `untestedFlowRisk` in the report ([14 §4](14-quality-report-and-score.md)) — already ranked, because it is the same list.

---

## 7. Budgets (`NFR-3`, `P-1`)

| Operation | p50 | Cap | On cap |
|---|---|---|---|
| `detectLoginForm` | 3 ms | 50 ms | pure — cannot bind |
| Authenticate (navigate, fill, submit, verify) | 2.5 s | 10 s | continue unauthenticated |
| One driver expansion (restore, act, observe) | 900 ms | 5 s | item dropped with a reason |
| `chooseBatch` (call site 1) | 3 s | 10 s | fall back to the value sort |
| `cluster()` | 8 ms | 200 ms | pure |
| `rank()` | 1 ms | 50 ms | pure |
| **The whole stage** | **45 s** | **90 s** | forced close, partial map, `haltReason` set |

`P-1` — the first capability planned within 60 s of a URL — is met by opening the first lap on the highest-ranked capability the moment `TG-3` fires, not by waiting for anything else to finish.

---

## 8. Known limitations — state these before a judge finds them

| Limitation | Impact | What we do about it |
|---|---|---|
| The deny-list blocks the most valuable flows | *Place order* is explored up to the button and no further | Recorded as `observedNotExercised`, raised by the Critic as a gap, unlocked by the disposable-target opt-in (`FR-209`) |
| `restore()` by URL fails on multi-step wizards | Some deep states are unreachable inside the budget | Path replay as a fallback; a signature mismatch drops the item with a reason rather than exercising it from the wrong state |
| Clustering is structural, not semantic | Two unrelated features under `/settings` can merge | Pass 4 splits above 8 states, and the model's naming pass makes a bad merge *visible* in the name |
| Ranking weights are reasoned, not fitted | The order is defensible, not proven optimal | Said plainly. The weights are one exported constant with one test, so re-fitting them against real sessions is cheap |
| A single-page app with no route changes | Route templates stop discriminating; clustering leans entirely on the nav-stripping pass | Signatures still separate states; expect coarser capabilities, and the report says so |

The first row is the one to volunteer unprompted. It costs us measured coverage on purpose, and a system that quietly clicked *Place order* on a stranger's application in order to score better would be the wrong tool no matter what the number said.

---

## 9. Related documents

- Snapshots, signatures, affordances and the deny-list constant → [08 · Perception Layer](../02-architecture/08-perception-layer.md)
- The shapes this stage emits → [05 §2.3–2.4](../02-architecture/05-data-model.md)
- The loop harness, its ceilings and the forced close → [06 §2](../02-architecture/06-agent-contracts.md)
- Call site 1's contract and fallback → [07 §3.1](../02-architecture/07-llm-integration.md)
- What the backlog feeds → [10 · Planner](10-planner.md); what its remainder becomes → [14 §4](14-quality-report-and-score.md)
- Why one capability at a time → [ADR-012](../decisions/ADR-012-capability-lap.md)
