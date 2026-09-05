# 12 · Generator

> **The stage with no model in it.** The Planner emits data; the compiler emits code. Nothing a model produced is ever `eval`ed, templated into source, or written to disk as TypeScript (`FR-401`, `NFR-5`).
> **This document owns:** the compile passes, the locator ladder's *generation* ordering, the live-validation protocol, the emitted project layout, and the provenance header.
> **Governing decision:** [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md) — the plan is the truth; `.spec.ts` is a projection.

---

## 1. The contract

```ts
// packages/core/compile
compile(plan: TestPlan): CompiledSuite;                                        // pure
validate(suite: CompiledSuite, page: Page): Promise<ToolResult<ValidatedSuite>>;  // TG-7
emitProject(suite: ValidatedSuite, outDir: string): Promise<ToolResult<string[]>>;
```

`compile()` is pure and total: same plan in, byte-identical suite out. `validate()` is the only part that touches a browser, and it is where `TG-7` lives. `emitProject()` writes through `store.safeWrite()` into `tests/generated/**` and nowhere else (`FR-407`, `I-9`).

**Why the model is absent here, in one line:** the moment a model writes code, the safety story becomes *"we reviewed what it wrote"*. With a compiler, the safety story is *"it cannot write code"* — and the second is a property, not a practice.

---

## 2. Five passes

```
TestPlan
   │
   ├─ 1  NORMALISE     order scenarios by (priority, id); order steps by `order`;
   │                   resolve each step's affordance from the subgraph
   ├─ 2  LOCATE        strategy + args -> a Playwright locator expression        (§3)
   ├─ 3  ASSERT        expectedOutcome + assertion steps -> concrete assertions  (§5)
   ├─ 4  VALIDATE      resolve every locator; execute every assertion, live      (§4)  TG-7
   └─ 5  EMIT          render the project; capture fingerprints; write           (§6, §7)
      │
   CompiledSuite -> ValidatedSuite -> files on disk
```

Passes 1–3 are pure and testable with no browser. Pass 4 needs a live page. Pass 5 needs a filesystem. That boundary is why the compiler has ~40 unit tests that run in under a second and two smoke tests that need Chromium.

---

## 3. The locator ladder (`FR-404`)

The Planner emitted `{ strategy, args }`. Pass 2 turns that into an expression, and it may **descend** the ladder but never skip upward past a rung that resolved uniquely.

| # | Strategy | Emitted form |
|---|---|---|
| 1 | `role_name` | `getByRole('button', { name: 'Place order' })` |
| 2 | `label` | `getByLabel('Coupon code')` |
| 3 | `placeholder` | `getByPlaceholder('Enter coupon')` |
| 4 | `text` | `getByText('Place order', { exact: true })` |
| 5 | `test_id` | `getByTestId('login-submit')` |
| 6 | `alt_title` | `getByAltText('Cart')` / `getByTitle('Cart')` |
| 7 | `dom_relative` | `locator('#order-actions').getByRole('button')` |
| 8 | `css` | `locator('button.primary')` |
| — | `xpath` | **Never emitted.** A positional path is not an address, it is a coordinate |

### 3.1 The selection algorithm

```
for rung in LADDER starting at the Planner's proposed strategy:
    expr = build(rung, step, affordance)
    if expr is null: continue                       // the affordance lacks the input
    n = await page.locator(expr).count()
    if n == 1: return expr
    if n > 1:
        scoped = scopeToNearestLandmark(expr)       // getByRole('main').getByRole(...)
        if count(scoped) == 1: return scoped
    // n == 0 or still ambiguous -> descend
return DROP(step, reason)
```

Two rules keep this from quietly producing brittle tests:

- **Never `.nth()`, never `.first()`.** Disambiguating by position is the failure mode the ladder exists to avoid; an ambiguous locator that cannot be scoped to uniqueness is a *dropped scenario*, not a gamble. This is the same rule the action tools enforce at runtime — `LOCATOR_AMBIGUOUS` never acts ([06 §5.2](../02-architecture/06-agent-contracts.md)).
- **`pnpm forge lint:locators` fails the build when a lower rung is used while a higher one resolved uniquely.** The ladder is enforced by a check over the emitted files, not by trusting pass 2 to have done it right.

### 3.2 Why `test_id` sits below `text` here and above it in the healer

`FR-404` puts `getByTestId` at rung 5, below `getByText`. The healing ladder ([13 §3](13-triage-and-healing.md)) gives `test_id` a base trust of 0.95, above `text` at 0.80. That looks like a contradiction and it is worth naming before someone finds it.

They answer different questions.

| | Generation asks | Healing asks |
|---|---|---|
| Question | *What should this test say?* | *Is this the same element?* |
| Best answer | What a user perceives — role and name, then the visible text | What survives a copy edit — a stable hook beats prose |
| So | Prefer accessible, human-meaningful locators; do not make the suite depend on the app having added test hooks | A `data-testid` match is stronger evidence of identity than matching text, because text is the thing that changes |

A generated suite full of `getByTestId` is a suite that only works on applications that instrument themselves, and it silently stops testing accessibility as a side effect. A heal that trusts text over a stable id will happily follow a renamed label onto a different button. Both orderings are right for their own question, and neither is a typo.

---

## 4. Live validation — `TG-7` (`FR-402`, `FR-403`)

Nothing is written until the whole scenario has been executed against the running application in a throwaway browser context.

```
for scenario in suite:
    ctx = freshContext(storageState)            // isolated; no state leaks between scenarios
    for step in scenario.steps:
        if step is an action:
            n = resolve(step.locator)
            n == 1  -> perform it, capture the ElementFingerprint  (§5)
            n == 0  -> descend the ladder (§3.1); exhausted -> DROP scenario
            n >= 2  -> scope; still ambiguous -> DROP scenario
        if step is an assertion:
            execute it live
            pass  -> keep
            fail  -> repair once (§4.1); still failing -> DROP scenario
    record resolvedCount on every step
```

A dropped scenario is recorded with its reason, emitted as a `generate.dropped` event, and appears in the report as a coverage gap. **It is never emitted red.** A generated suite that fails on its first run teaches a team to ignore the tool by lunchtime.

### 4.1 The one repair pass for assertions

| Failure | Repair | If it still fails |
|---|---|---|
| Text matches after whitespace collapse and case folding | Re-emit with `mode: "contains"` on the normalised value | drop |
| The expected text is present in an ancestor, not the cited element | Re-point the assertion at the nearest ancestor that resolves uniquely | drop |
| `assertUrl` differs only in a trailing slash or query order | Normalise and re-check | drop |
| **The value contains a number or a currency symbol** | **No repair. Exact match or drop.** | drop |

The last row is deliberate and it is the same principle as veto `V3` ([13 §6](13-triage-and-healing.md)): a `contains` match on `₹999` passes happily against `₹9,999`. Money is asserted exactly or not at all.

### 4.2 "If every assertion must pass, how can a test ever find a bug?"

A judge will ask this, and the answer is short: **the suite is green by construction at t0, and its value is at t1.** It is a regression suite. Emitting an assertion that already fails would be emitting a broken test, not a discovered defect — the defect belongs in a report, not in a red spec file that a CI pipeline will teach people to ignore.

There is one case where the application is wrong *today*, and it has its own path: a PRD requirement the application does not satisfy. That never becomes a red test. It surfaces as a `BLOCKER` PRD gap in the assessment ([11 §8](11-coverage-critic.md)) and as a coverage gap in the report — a finding stated as a finding.

---

## 5. Fingerprint capture at generation time (`FR-406`)

Every interactive step's `ElementFingerprint` is captured during pass 4, **on the successful interaction**, before the file is written. Not on the first run — at generation.

That timing is the whole point: the record we later heal against is a record of the element *while it still worked*, taken from a build we know was green. A fingerprint captured on a failing run is a fingerprint of the problem.

Captured per [05 §2.9](../02-architecture/05-data-model.md), with the attribute allowlist applied at capture so framework hydration attributes never enter the record. Every `click`/`fill`/`select` step has a non-null `fingerprintId` before the first run — asserted by `FR-406`'s test.

---

## 6. The emitted project (`FR-405`, `FR-408`)

```
out/
├── package.json                 @playwright/test only. No FORGE dependency, anywhere.
├── playwright.config.ts         chromium · fixed viewport · animations off · trace on-first-retry
├── README.md                    how to run it, and what generated it
├── forge.manifest.json          session id, plan ids, model id, browser revision, timestamps
├── .gitignore                   .auth/  test-results/  playwright-report/
└── tests/
    ├── auth.setup.ts            one login from process.env -> .auth/state.json   (FR-102, FR-006)
    ├── fixtures/forge.ts        shared helpers; no network, no cleverness
    └── generated/               MACHINE-OWNED (FR-407)
        ├── checkout.spec.ts     one file per capability                          (FR-408)
        ├── sign-in.spec.ts
        └── account.spec.ts
```

`EC-07` is the acceptance test for this section: copy `out/` to a clean directory with FORGE uninstalled, `npm i && npx playwright test`, and the suite runs. No FORGE import, no relative path escaping `out/`, no environment variable beyond the two credentials.

### 6.1 A generated file

```ts
// GENERATED BY FORGE — do not edit by hand. Machine-owned path (FR-407).
// capability: cap_01j9x2m4 "Checkout"
// plan:       pln_01j9x2m9 round 1 · assessment score 0.8435 · floor 0.70
// scenarios:  SC-001 SC-002 SC-003 SC-004 SC-005 SC-006
import { test, expect } from "@playwright/test";

test.describe("Checkout", () => {
  test("[SC-001] Guest checkout with a valid card", async ({ page }) => {   // FR-409
    await page.goto("/checkout");
    await page.getByRole("textbox", { name: "Full name" }).fill("Ada Lovelace");
    await page.getByRole("textbox", { name: "Card number" }).fill(process.env.FORGE_TEST_CARD!);
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
  });
});
```

Flat, boring, and readable by a QA engineer who has never heard of this project. That is the target.

### 6.2 What the compiler refuses to emit

| Refused | Why |
|---|---|
| `if` / `try` / `catch` / ternaries | A test that can branch is a test that can hide a failure |
| Loops | A loop hides *which* iteration failed; unroll or drop |
| `waitForTimeout` | A sleep is a race condition with a comment. Use `waitFor` on a locator or an assertion |
| `.nth()`, `.first()`, `.last()` | Positional selection — §3.1 |
| `page.evaluate` | Executing a string in the page is the injection surface `NFR-5` closes |
| Comments carrying model prose | The header cites ids; explanations live in the plan, which is the source of truth |
| Cross-capability imports | `FR-408`. One file, one capability, one reason to change |

---

## 7. Determinism (`FR-401`, `NFR-1`)

*Compiling the same plan twice is byte-identical* is an acceptance criterion, and one careless line breaks it. The rules:

- **No wall-clock time in emitted code.** The provenance header carries ids and scores, never a timestamp. Timestamps live in `forge.manifest.json`, which is a sidecar and is excluded from the byte-identity check.
- **No random or session-scoped values.** Test data comes from the plan or from `process.env`; a generated fixture value is derived from the scenario id, not from `Math.random()`.
- **Deterministic ordering everywhere.** Scenarios by `(priority, id)`, steps by `order`, imports alphabetically, object keys in schema declaration order.
- **Formatting is applied by the compiler**, not by a developer's editor: two-space indent, double quotes, semicolons, LF, one trailing newline. Prettier runs over the output as a *check*, never as a fix, so a formatting disagreement fails loudly instead of producing two byte-different-but-equivalent files.

The test is one line: compile a fixture plan twice, compare SHA-256.

---

## 8. Machine-owned paths (`FR-407`)

`tests/generated/**` belongs to the compiler. A human commit touching it fails CI — a path check in the workflow, not a convention in a README.

The reasoning is [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md) made operational: if a human edits the generated file, the plan and the code disagree, and the next heal regenerates the file and silently destroys their work. Making the path machine-owned means that conversation happens once, in CI, instead of once per developer, in confusion. A human who wants a different test writes a scenario ([`FR-909`](../01-foundation/02-requirements.md)) and lets it be compiled like any other.

---

## 9. Worked example — one scenario, end to end

**Plan step (JSON, from the Planner):**

```json
{ "id": "s4", "order": 3, "kind": "click",
  "targetIntent": "submit the order",
  "stateId": "st_01j9x2k5", "affordanceRef": "e9",
  "locatorStrategy": "role_name",
  "locatorArgs": { "role": "button", "name": "Place order" } }
```

| Pass | What happens |
|---|---|
| 1 · normalise | `e9` resolves to `{ role: "button", accessibleName: "Place order", destructive: false }` |
| 2 · locate | `getByRole('button', { name: 'Place order' })` |
| 3 · assert | Not an assertion step; skipped |
| 4 · validate | `count() === 1` → clicked → `resolvedCount: 1`, fingerprint `fp_01j9x3ac` captured |
| 5 · emit | `await page.getByRole("button", { name: "Place order" }).click();` |

Had `count()` returned 2, pass 4 would have tried `getByRole('main').getByRole('button', { name: 'Place order' })`; had that still returned 2, `SC-001` would have been dropped with reason `AMBIGUOUS_LOCATOR` and the report would carry a `MISSING_FLOW` gap naming the flow that could not be generated.

---

## 10. Budgets and limitations

| Operation | p50 | Cap | On cap |
|---|---|---|---|
| `compile()` (passes 1–3) | 12 ms | 500 ms | pure |
| `validate()` per scenario | 1.8 s | 8 s | Scenario dropped with reason `VALIDATION_TIMEOUT` |
| `validate()` per suite | 8 s | 30 s | Unvalidated scenarios dropped; the lap proceeds with what passed |
| `emitProject()` | 120 ms | 3 s | `LAP_FAILED` — a partially written suite is never left on disk |

| Limitation | Impact | Stated answer |
|---|---|---|
| Live validation doubles the work of a lap | ~8 s of a 90 s budget | Bought deliberately: it is the difference between a suite that runs and a suite that compiles |
| Validation asserts against *this* build | An assertion valid today may be invalid on a build we never saw | That is what the suite is for. `t1` is where it earns its keep |
| Test data is invented, not seeded | A card number or coupon may be rejected by the real backend | Fails at pass 4 and drops with a reason, rather than shipping red. Real data belongs in `process.env` |
| One file per capability can grow large | A 12-scenario checkout file is long | Accepted — the alternative is cross-file coupling, which is worse to read and worse to regenerate |
| No visual or accessibility assertions | Those flows go untested | Deferred with the design pillar ([ADR-013](../decisions/ADR-013-design-intelligence-deferred.md)); the shapes survive in [deferred/](../deferred/design-intelligence.md) |

---

## 11. Related documents

- What it compiles → [10 · Planner](10-planner.md)
- What had to pass before it ran → [11 · Coverage Critic](11-coverage-critic.md)
- What runs the output and what breaks it → [13 · Triage & Healing](13-triage-and-healing.md)
- The action and assertion tool contracts → [06 §5.2–5.3](../02-architecture/06-agent-contracts.md)
- The fingerprint shape → [05 §2.9](../02-architecture/05-data-model.md)
- Why the plan is patched and the code regenerated → [ADR-006](../decisions/ADR-006-spec-as-source-of-truth.md)
