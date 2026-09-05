# 08 · Perception Layer

> **New at Batch 2.** The pre-brief design had no perception layer because it never had to look at an application it had not been told about. The brief's first MUST is *"explore the application"*, and everything downstream — grounding, coverage, healing — is only as good as what the system can see.
> **This document owns:** the snapshot format, the state signature, and the affordance model.
> **It does not own:** the frontier algorithm, capability clustering, or risk ranking. Those are [09 · Exploration & Prioritisation](../03-algorithms/09-exploration-and-prioritisation.md).

---

## 1. The problem this layer solves

An agent that is going to test an application it has never seen needs an answer to one question, thousands of times: **what is on this page, and what can I do with it?**

Three properties make an answer usable, and they pull against each other:

| Property | Why it matters | What breaks without it |
|---|---|---|
| **Small** | It goes into a model prompt, repeatedly, inside a budget | A dense page's raw DOM is 200 KB+; the prompt costs more than the reasoning is worth |
| **Stable** | The same page must look the same twice | Nothing can be deduplicated; the crawl never terminates |
| **Actionable** | Everything named must be reachable by a locator later | The Planner grounds a step in something the Generator cannot compile |

The accessibility tree gives all three, at a cost we state plainly in §6. It is the perception primitive of this system, and everything else in this document is machinery around it.

---

## 2. The snapshot

```ts
snapshot(ctx): Promise<ToolResult<AccessibilitySnapshot>>
```

A snapshot is Playwright's ARIA snapshot of the page — roles, accessible names, structure, no styling and no markup — with one pass of our own on top: every interactive node is assigned a **ref**, a snapshot-local handle in traversal order.

```yaml
# state st_01j9x2k5 · /checkout · 1.9 KB
- banner:
  - link "Aperture" [ref=e1]
  - navigation:
    - link "Cart (2)" [ref=e2]
- main:
  - heading "Checkout" [level=1]
  - form "Shipping":
    - textbox "Full name" [ref=e3]
    - textbox "Address line 1" [ref=e4]
    - combobox "Country" [ref=e5]
  - group "Payment":
    - textbox "Card number" [ref=e6]
    - textbox "Coupon code" [ref=e7]
    - button "Apply" [ref=e8]
  - button "Place order" [ref=e9]
  - button "Cancel order" [ref=e10] [destructive]
- contentinfo:
  - link "Terms" [ref=e11]
```

| Property | Value |
|---|---|
| Typical size | 1–4 KB · **hard budget 8 KB** for a page whose raw DOM exceeds 200 KB (`FR-104`) |
| Interactive cap | 200 nodes, dropped from the end of traversal order, with the true count kept in metadata |
| Stored as | `Evidence` of type `SNAPSHOT`, content-addressed — so two identical pages store once |
| Determinism | A pure function of the DOM at capture time; no model, no randomness |

**Refs are ours, not Playwright's.** They are assigned deterministically by traversal order and are valid only within one snapshot. They exist so a model can say *"exercise `e7` and `e8`"* without ever emitting a selector — the same discipline as `FR-401` applied to perception: the model refers to things, the deterministic layer resolves them.

**The 200-node cap is a real constraint, and we report it rather than hide it.** `interactives.length` versus the true count goes into the snapshot's metadata and, when it bites, into the report's untested-flow risk section. A perception layer that silently truncates is a perception layer that produces confidently incomplete coverage.

---

## 3. State signatures — how a crawl terminates

Without deduplication, a fifty-page product list is fifty states, exploration never exhausts its frontier, and `FR-107` (*terminate*) is unsatisfiable. The signature is what collapses them.

```ts
stateSignature(snap: AccessibilitySnapshot): string   // pure · 16 hex chars
```

### 3.1 The algorithm

1. **Normalise the URL to a route template.** Numeric and UUID-shaped path segments and all query values become placeholders: `/orders/8841/items?page=3` → `/orders/:id/items?page=:v`.
2. **Drop non-interactive text.** Headings and landmark roles are kept; body copy, prices, item names and other content are discarded.
3. **Collapse repeated siblings.** Consecutive sibling subtrees with an identical role-shape become one node carrying `repeat: n`. This is the step that turns fifty product cards into one.
4. **Mask digits in retained names.** `Cart (2)` → `Cart (#)`. A cart badge changing from 2 to 3 is not a new state.
5. **Emit the canonical skeleton** — the ordered role tree with control names only — and hash it. First 16 hex characters of the SHA-256.

### 3.2 Worked example

| Page | Raw DOM | Signature | Result |
|---|---|---|---|
| `/products?page=1` | 180 KB, 50 cards | `a3f9c2d1e8b47605` | new state `st_…` |
| `/products?page=2` | 178 KB, 50 different cards | `a3f9c2d1e8b47605` | **same state**, `visitedVariants: 2` |
| `/products?page=1&sort=price` | 181 KB, reordered | `a3f9c2d1e8b47605` | **same state**, `visitedVariants: 3` |
| `/products/8841` | 42 KB, one product | `7c14b0aa93de5521` | new state |
| `/cart` (empty) | 12 KB | `d90e4471bb2a3f18` | new state |
| `/cart` (2 items) | 19 KB | `d90e4471bb2a3f18` | **same state** — the affordances are identical |

The `/cart` row is the one worth arguing about, and we accept it deliberately: an empty cart and a full cart offer the same *affordances*, so they are the same state for the purpose of "what can I do here". The **difference between them is a test**, not a state — and it is exactly the kind of thing the Critic should demand as a `MISSING_EDGE_CASE` gap. Perception's job is to bound the crawl; noticing that empty and full behave differently is the Planner's.

### 3.3 The failure mode, stated before someone finds it

Two structurally identical pages with different purposes — say `/settings/profile` and `/settings/billing`, both a heading and four textboxes — can collide. Three defences, in order of how much they cost:

1. The route template is part of the hash, so different routes cannot collide at all. Collisions require the same route template **and** the same skeleton.
2. Landmark headings are retained, so *Profile* and *Billing* separate on their `<h1>`.
3. Residual collisions surface as a state whose `visitedVariants` climbs while its transitions keep pointing somewhere new — a pattern the eval harness asserts against on a fixture built to collide.

The honest summary: signatures are tuned for **recall of sameness** — we would rather merge two similar states and under-explore than split one state fifty ways and never terminate. Under-exploration is visible in the report as untested flow risk. Non-termination is a demo that never finishes.

---

## 4. Affordances

An affordance is *something a user could do here*. It is the atom the whole pipeline is grounded in: the Planner cites one in every step (`FR-204`, `I-13`), the Critic counts them to score coverage (`FR-303`), and the Generator turns one into a locator.

```ts
affordancesOf(snap: AccessibilitySnapshot): Affordance[]   // pure, deterministic
```

Extraction is mechanical: every node with an interactive role becomes an `Affordance` carrying its role, accessible name, kind, enabled state, bounding box and ref. Nothing about this step is a judgement, which is why it is code and not a call.

### 4.1 The destructive deny-list (`FR-106`, `NFR-6`, `I-20`)

Exploring somebody's live application means clicking things. A crawler that finds the delete button and presses it is not a testing tool, it is an incident.

```ts
const DESTRUCTIVE = /\b(delete|remove|cancel|void|refund|discard|revoke|terminate|
                       destroy|clear|reset|deactivate|unsubscribe|pay|transfer|
                       submit order|place order|close account)\b/i;
```

An affordance whose accessible name matches is marked `destructive: true`, and the action tools return `ACTION_DENIED` **without acting** if anything tries to exercise it during exploration. It is recorded with `observedNotExercised: true` and a reason — never dropped.

> **This is not the same list as veto `V2`.** The exploration deny-list is deliberately *broader*: it includes `pay`, `transfer` and `place order`, which are perfectly legitimate things for a generated test to do on a target the user has opted into, but are never acceptable for a crawler to press uninvited. `V2` — the destructive-verb heal veto in [13 §6](../03-algorithms/13-triage-and-healing.md) — answers a different question: *may we silently re-point a locator from a benign control to a destructive one?* Two lists, two purposes, and conflating them would either make exploration reckless or make healing uselessly timid. Both are unit-tested constants in `packages/perception` and `packages/core/healing` respectively.

Two consequences worth being explicit about:

- **Recording beats omitting.** The Critic can see that *Cancel order* exists and was never exercised, and can raise it as a coverage gap the user might choose to opt into on a disposable target. An affordance we deleted from the map is a gap nobody can find.
- **This costs us coverage on purpose.** Checkout's own *Place order* is on the list, so the highest-value flow in a shop is explored right up to the button and no further. That is the correct default for a stranger's application, and it is why `FR-209` and the target-safety opt-in exist: on a target the user marks disposable, the deny-list relaxes and the demo goes all the way through. The demo makes this visible by showing what the Explorer **declined to press** — a slide competitors will not have.

### 4.2 Authentication is deterministic first (`FR-101`, `FR-102`)

Login detection runs **before** any model call: a form containing a password-type input, plus a text input whose label or name matches an identity pattern, plus a submit control. Three structurally different login pages, one detector, no configuration.

Once through, `storageState` is persisted once and reused for every later navigation and every generated test (`FR-102`). Generated specs declare it via a setup project and perform **zero** interactive logins — which is what keeps the emitted suite portable (`FR-405`) and keeps the password out of the generated code (`FR-006`).

The model is consulted only when the deterministic detector finds nothing and the page still looks like a gate. Auth is too load-bearing to be probabilistic by default.

---

## 5. What perception hands to each consumer

| Consumer | What it takes | What it does with it |
|---|---|---|
| **Explorer loop** | The current snapshot, the unvisited affordances | Chooses what to exercise next — the only open-world judgement in the stage |
| **Signature / dedup** | The snapshot | Collapses variants; makes the frontier finite |
| **Planner** | The capability's subgraph of states and affordances | Grounds every step in a `stateId` + `affordanceRef` |
| **Critic** | Affordance and transition counts for the capability | The structural half of the coverage score — arithmetic, reproducible |
| **Generator** | The affordance's role and accessible name | The top rung of the locator ladder: `getByRole(role, { name })` |
| **Healer** | The fingerprint captured at generation time | Six-signal scoring against the live page |

**The line from perception to healing is the one to notice.** The Generator's first-choice locator is built from the same role and accessible name that perception recorded, which is why `getByRole` is both the most stable locator and the one the system reaches for first — the perception layer and the locator ladder agree about what identifies an element, by construction rather than by coincidence.

---

## 6. Why not the alternatives

### Not raw DOM

**Its real advantage:** completeness. Everything is there — custom widgets, canvas elements, `div`s pretending to be buttons, the lot. Nothing is lost in translation.

**Why not:** it is 20–100× larger, it is dominated by framework noise that changes on every build, and it does not distinguish *"a thing you can do"* from *"a wrapper element"*. A prompt built from raw DOM is expensive, unstable between builds, and pushes the model toward brittle CSS selectors — the bottom of the ladder `FR-404` exists to avoid. We still capture normalised DOM as **evidence** for diagnosis, where completeness matters and prompt size does not.

### Not screenshots and vision

**Its real advantage:** it sees what a user sees, including canvas apps and custom widgets that publish no accessibility information at all. It is the only channel that works on the hardest targets.

**Why not, here:** vision tokens are expensive per page, coordinates are not locators — a click at (412, 908) cannot be compiled into a portable Playwright test — and pixel perception is the least reproducible input we could choose for a system whose central claim is that its decisions are reproducible. Screenshots stay in the system as **evidence and fingerprint crops**, where they are genuinely the right tool.

### Not `@playwright/mcp`

The Playwright MCP server exposes almost exactly this snapshot format over a subprocess. This is work-plan item `W-4`, and it is resolved in **[ADR-016](../decisions/ADR-016-perception-transport.md)**: we call Playwright directly. The short version — we need refs, signatures, the deny-list and evidence capture to be *ours*, deterministic and unit-testable, and a subprocess adds a lifecycle to manage on demo day for a format we would still have to post-process.

### The cost we accept

**Assumption A1 from [ADR-011](../decisions/ADR-011-agent-topology.md): accessibility snapshots may be insufficient on canvas-heavy or heavily custom-widget applications.** A `<div onclick>` with no role and no accessible name is invisible to this layer. That is a real limitation, not a hypothetical:

- **How we falsify it:** run the Explorer against one such target in Ph2 and record exactly what it misses. That is a scheduled task, not an aspiration ([decisions/README](../decisions/README.md)).
- **What we do when it bites:** the affordance count from the snapshot is compared against a cheap DOM count of click-handled elements. A large divergence sets `CapabilityMap.frontier.haltReason` context and raises a `MISSING_FLOW` gap saying *"this page has interactive elements we could not identify"* — the system reports its own blind spot rather than reporting high coverage of the part it could see.
- **What we say to a judge:** "It perceives through the accessibility tree, which is why the tests it writes use accessible locators and survive refactors. On an application with no accessibility information it tells you it could not see, instead of guessing."

That last sentence is the same principle as refusing to heal, applied one layer earlier.

---

## 7. Budgets

| Operation | p50 | p95 | Cap | On cap |
|---|---|---|---|---|
| `snapshot` | 180 ms | 500 ms | 3 s | `TIMEOUT`; the state is recorded as partial |
| `stateSignature` | 1 ms | 3 ms | 50 ms | — (pure) |
| `affordancesOf` | 2 ms | 6 ms | 50 ms | — (pure) |
| `getDomSnapshot` (evidence) | 120 ms | 400 ms | 2 s | `TIMEOUT` |
| Politeness delay between navigations | 250 ms | — | — | Backs off on `429` (`Q-3`) |

Two of the five are pure functions over a captured snapshot, which is why the whole of §3 and §4 is testable against fixture YAML with no browser at all — and why `EC-02` can assert exploration behaviour deterministically with the API key unset.

---

## 8. Related documents

- The shapes this layer produces → [05 §2.3](05-data-model.md)
- Who calls `snapshot()`, and with what tools → [06 §3](06-agent-contracts.md)
- The frontier, clustering and risk ranking → [09 · Exploration & Prioritisation](../03-algorithms/09-exploration-and-prioritisation.md)
- Why direct Playwright rather than the MCP server → [ADR-016](../decisions/ADR-016-perception-transport.md)
- How affordance counts become a coverage score → [11 · Coverage Critic](../03-algorithms/11-coverage-critic.md)
