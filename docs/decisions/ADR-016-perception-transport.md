# ADR-016 · Call Playwright directly; do not run the MCP server

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 — Batch 2, resolving work-plan item `W-4` |
| **Deciders** | All |
| **Requirements** | `FR-104`, `FR-106`, `FR-107`, `FR-108`, `FR-406`, `NFR-1`, `NFR-2`, `NFR-5` |
| **Governs** | [08 · Perception Layer](../02-architecture/08-perception-layer.md) · [06 · Agent Contracts](../02-architecture/06-agent-contracts.md) |
| **Related** | [ADR-011](ADR-011-agent-topology.md), [ADR-002](ADR-002-llm-role.md) |

---

## 1. Context

The Explorer needs to perceive an application it has never seen and act on it. Microsoft ships `@playwright/mcp`, an MCP server that exposes exactly that capability to a model: an accessibility snapshot with element refs, plus `click`, `type`, `navigate` and friends, with tool descriptions already written and tested against real models.

It is, on its face, precisely the thing we need. The work plan filed it as `W-4` with a default of *"direct — fewer moving parts"* and a note to decide it in Batch 2. This is that decision, and it deserves better than its default, because the MCP option is genuinely good and would save us real work.

The question is not *"is `@playwright/mcp` any good?"* It is: **which parts of perception must be ours for the guarantees in this project to hold?**

---

## 2. The two options

### Option A — Run `@playwright/mcp` as a subprocess

The Explorer becomes an MCP client. The server owns the browser, produces the snapshot, assigns the refs, and executes actions.

**Its real advantages, stated fairly:**

- **It is maintained by the Playwright team**, and its snapshot format has been tuned against real models on real sites — work we would otherwise redo by trial and error.
- **The tool descriptions already exist**, and model-facing tool descriptions are a surprisingly large share of whether an agent loop works at all.
- **The ref mechanism is already solved**, including the fiddly part: keeping a ref valid between the snapshot and the action that uses it.
- **It is a standard boundary.** Anything else speaking MCP could drive the same perception surface later, which is a real architectural option and not just a buzzword.
- **It is free and immediate.** On an eight-hour budget, "already written" is a strong argument on its own.

### Option B — Call Playwright directly *(chosen)*

`packages/perception` owns the snapshot, the refs, the signature and the deny-list, calling `page.ariaSnapshot()` and the Playwright API in-process.

**Its real advantages:** everything below.

### Comparison

| Criterion | A · MCP server | **B · direct** |
|---|---|---|
| Browser stacks in the system | **Two** — MCP's for exploration, ours for generation, execution and healing | **One** |
| Auth state shared between exploring and testing | Needs handing `storageState` across a process boundary | Same `BrowserContext`, no transfer |
| The no-throw law (`ToolResult`, [06 §1](../02-architecture/06-agent-contracts.md)) | Errors arrive as tool text; we re-derive a code by parsing strings | Native — the code *is* the value |
| `ACTION_DENIED` before acting (`FR-106`) | We must intercept and filter another process's tool surface | A branch in our own `click()` |
| State signature and dedup (`FR-108`) | Post-process their snapshot anyway | On the object we built |
| Fingerprint capture on every successful action (`FR-406`) | Not something the server does — a second pass, or lost | In step 5 of every action tool |
| Evidence capture, content-addressed (`FR-505`) | Ours regardless; the server does not persist for us | In-line |
| Unit-testable with no browser and no subprocess | Partly | **Fully** — signatures and affordances are pure functions over fixture YAML |
| Moving parts on demo day | A subprocess with a lifecycle, a port and a failure mode | None |
| Work saved up front | **Real — perhaps 60–90 minutes** | — |
| Standard boundary for future integrations | **Yes** | No |

---

## 3. Decision

**Call Playwright directly.** One reason dominates, and it is the row at the top of the table.

> **We need Playwright in-process regardless.** The Generator validates every locator against a live page, the Runner executes the suite, and the Healer resolves candidates against the DOM. None of that can go through an MCP server designed for an agent to drive a browser, because none of it involves an agent. So Option A does not *replace* our browser stack — it **adds a second one**, used by one stage out of eight, with a process boundary between exploration and everything that consumes exploration's output.

Two smaller reasons that would not have been sufficient alone but point the same way:

1. **The safety properties have to be inside our call path.** `FR-106` requires that a destructive affordance is never submitted; `I-20` requires that it is recorded rather than dropped. Implemented as a filter over somebody else's tool surface, that is an interception we must keep correct as their surface evolves. Implemented as a branch inside our own `click()`, it is four lines and a unit test.
2. **`ToolResult` is load-bearing.** The deterministic classifier switches on `error.code`, and the whole `NFR-2` degraded-mode story rests on those codes being exact. Re-deriving them by parsing another process's human-readable error text is precisely the string-matching-for-logic that [06 §1](../02-architecture/06-agent-contracts.md) forbids.

**What we take from Option A anyway.** Their snapshot format is good, and we copy its shape deliberately: roles, accessible names, and refs in traversal order. Learning from a well-tuned format costs nothing; running a subprocess to obtain it costs a lifecycle.

---

## 4. Consequences

### Accepted costs

1. **We write and tune the snapshot format ourselves**, including the model-facing descriptions, which is the part most likely to need a second pass in Ph2. Roughly 60–90 minutes we do not get back.
2. **We own ref stability** — the awkward case where the page changes between the snapshot and the action that cites a ref. Handled by re-resolving the ref against a fresh snapshot when an action fails with `LOCATOR_NOT_FOUND`, and treating a second failure as a state transition rather than an error.
3. **No standard boundary.** Nothing else can drive FORGE's perception layer over a protocol. We are not building a platform this week, so this costs nothing today and would cost a day later.

### Risks taken on

| Risk | Mitigation |
|---|---|
| Our snapshot format is worse for the model than theirs, and the Explorer flounders | Ph2 measures it: affordances discovered per model turn, on three targets. If ours underperforms, copy more of theirs — the format is public |
| Ref instability causes silent misclicks | An action never proceeds on an ambiguous ref (`LOCATOR_AMBIGUOUS`, no action taken); a stale ref is a re-snapshot, not a guess |
| We reinvent a bug they already fixed | Their repository is the reference implementation; when something misbehaves, read theirs before debugging ours |

### Hidden assumptions

- **A1.** That `page.ariaSnapshot()` output is stable enough across Playwright patch versions to hash into a state signature. Falsified the first time a browser upgrade changes a signature for an unchanged page. Cheap check: the pinned browser revision in `pnpm forge doctor` (`NFR-7`) already gates this, and the eval suite asserts a fixed signature against a stored fixture.
- **A2.** That 60–90 minutes of format tuning is the true cost, not a multiple of it. Falsified if Ph2 spends more than one hour on snapshot quality. That is the trigger to stop tuning and copy their format verbatim.
- **A3.** That nothing in the demo wants to expose FORGE's perception to an external agent. Safe this week; it is the first thing to revisit if this outlives the hackathon.

---

## 5. Flip triggers

Adopt `@playwright/mcp` if **any** of these becomes true:

- Ph2 measurement shows the Explorer discovering materially fewer affordances per turn with our format than with theirs, **and** an hour of tuning does not close the gap.
- FORGE needs to expose perception to an agent we do not own — a genuine platform requirement, not a nice-to-have.
- Playwright ships ref assignment and snapshot-scoped handles natively in a form that makes the direct path no cheaper than the MCP path.

Note what is *not* a trigger: "MCP is the standard way to do this in 2026." It is, and that is an argument about ecosystems, not about this system's guarantees. We would adopt it the moment it stopped costing us a second browser stack.

---

## 6. The sentence to say out loud

> "We already need Playwright in-process — the generator validates every selector against the live page and the healer resolves candidates against the DOM. Putting exploration behind an MCP subprocess would have given us a second browser, a second auth state and a process boundary between what we see and what we test, to save an hour of formatting work. We copied their snapshot format and skipped the subprocess."
