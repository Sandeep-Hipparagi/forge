# 19 · Target Applications

> **Rewrite of the pre-brief `11-sut-spec`.** That document specified *the* system under test, because the assumed problem gave us one application and a human-supplied intent. The real brief gives us **any URL**, and the organiser may hand us one on the day. So this document specifies three targets of increasing difficulty, the one we can break on purpose, and the drill for switching to a URL we have never seen.
> **This document owns:** the target roster, the bundled target's product surface and DOM contract, the injectable-defect catalogue `M-nn`, the control plane, the target-profile format, and the cold-switch procedure `R-3`.
> **Resolves `W-1`.**

---

## 1. Why three, and what each one proves

A single target proves the pipeline runs. Three targets of deliberately different shape prove it is a pipeline and not a fixture.

| | Target | What it is | The claim it earns |
|---|---|---|---|
| **T1** | **Aperture** — `apps/sut`, ours, `:4100` | A small server-rendered store with sign-in, cart, checkout and order history | *"We can prove refusal-to-heal, because we can inject the defect."* |
| **T2** | **SauceDemo** — `saucedemo.com`, public | A login-gated demo shop nobody on this team has ever touched the source of | *"It works on an application we did not build and cannot modify."* |
| **T3** | **Conduit** — the RealWorld reference app, self-hosted | An authenticated CRUD application: write, edit, publish, delete | *"It handles create/edit/delete surfaces — and declines to press the dangerous ones."* |

Each target is chosen for one property the other two lack.

**T1 is mutable.** This is the only reason it survives the re-aim. The brief's Bonus `B2` — telling a broken test from a broken product — cannot be demonstrated without a product defect, and you cannot inject a defect into somebody else's demo site. Every `M-nn` in §5 exists to make one veto or one classification observable on demand.

**T2 is not ours.** Its DOM is whatever Sauce Labs wrote, its accessible names are not the ones our fixtures were built against, and its login form is structurally different from Aperture's. It is the target that catches a login detector that only detects our login form.

**T3 is dangerous.** Conduit's article pages carry *Delete Article* next to *Edit Article*. That is the exploration deny-list's reason to exist ([08 §4.1](../02-architecture/08-perception-layer.md)), and T3 is where `observedNotExercised` stops being a schema field and becomes a visible line in the report: *"we saw this and deliberately did not press it."*

### 1.1 The rule that makes the roster meaningful

**Nothing about any target appears in FORGE's code.** No selectors, no route names, no accessible-name constants, no per-target branches. Three checks keep that true rather than aspirational:

| Check | Where |
|---|---|
| `sut-is-isolated` — the target cannot import FORGE | `.dependency-cruiser.cjs` ([15 §2.2](15-repo-and-conventions.md)) |
| A unit test greps `packages/**` for `saucedemo`, `conduit`, `place-order`, `4100` and every literal in §3 | `packages/core/test/no-target-literals.test.ts` |
| Rehearsal `R-3` runs a target FORGE has never seen, from cold, timed | §7 |

The second check is the one that would catch the honest mistake — a `if (url.includes("saucedemo"))` written at hour five to get past a flake. It fails the build, which is the correct place for that conversation to happen.

---

## 2. T1 · Aperture — the bundled mutable target

### 2.1 Why we build our own, still

| Option | Verdict |
|---|---|
| Only public sandboxes | **Rejected.** No controlled defect, no guaranteed uptime, no pinned DOM, no frozen clock. `NFR-1` and the entire `B2` story die with it. |
| **Our own deterministic app, plus two public ones** | **Chosen.** Full control where we need control; real variety where we need credibility. |

Full trade-off in [ADR-007](../decisions/ADR-007-demo-app.md), which the re-aim validated rather than invalidated — the analysis was about determinism and injectability, and both are still required.

### 2.2 Server-rendered templates, not a SPA

| | Server-rendered (chosen) | React SPA |
|---|---|---|
| DOM determinism | Identical bytes every render | Hydration attributes, key churn, effect ordering |
| Startup | ~120 ms, no build step | Build + dev-server warmup inside the demo path |
| Defect injection | One pure transform over the render context | State plumbing through components |
| Framework noise in fingerprints | None | `data-reactroot`, minified class names |
| Realistic | Less | More |

We trade realism for determinism because **the target is not the product.** A judge never evaluates Aperture; they evaluate whether FORGE's verdict about Aperture was right. Every millisecond of hydration nondeterminism is risk purchased for nothing — and T2 and T3 supply the realism T1 gives up.

Stack: Express 4 + [Eta](https://eta.js.org) templates + one hand-written CSS file + ~40 lines of vanilla JS. No bundler, no client framework, three dependencies.

### 2.3 Product surface

**Aperture** — a fictional camera-accessories store. Larger than the pre-brief edition, and for a specific reason: `FR-103`'s acceptance criterion is *≥ 6 states and ≥ 10 transitions*, and `FR-902` needs several capabilities before "one capability at a time" means anything. A one-page checkout cannot exercise the lap loop.

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/login` | GET · POST | Sign in | — |
| `/` | GET | Product list, 3 fixed SKUs | — |
| `/product/:sku` | GET | Product detail, add to cart | — |
| `/cart` | GET · POST | Cart contents, quantity, remove | — |
| `/checkout` | GET · POST | **The screen the anchor lives on**; coupon; place order | ✅ |
| `/order/:id` | GET | Confirmation with an order reference | ✅ |
| `/account/orders` | GET | Order history | ✅ |
| `/api/coupon` · `/api/orders` | POST | `{code}` → `{valid, discountPaise}` · place order → `{orderId}` | ✅ |
| `/__forge/*` | — | Control plane · §5.3 · **loopback only** |  |

**Credentials.** `ada@aperture.test` / `correct-horse-battery`, fixed in the seed and passed to FORGE like any other target's. They are never hardcoded anywhere in `packages/**` — they live in the target profile (§6) and reach the session through `FR-003`.

### 2.4 The capability map it must yield

This is an acceptance criterion, not a description. If exploration of Aperture does not produce this shape, the Explorer has regressed.

| Capability | States | Contains | Risk rank (no intent) |
|---|---|---|---|
| **Checkout** | `/checkout`, coupon-applied, coupon-error, `/order/:id` | money, a form submit, the auth boundary | 1 |
| **Sign-in** | `/login`, login-error | credentials, high centrality | 2 |
| **Account Orders** | `/account/orders` | authenticated, PII-adjacent | 3 |
| **Cart** | `/cart`, empty-cart | mutation, no money capture | 4 |
| **Browse** | `/`, `/product/:sku` | read-only, largest affordance count | 5 |

≥ 11 states, ≥ 14 transitions, 5 capabilities, `haltReason: EXHAUSTED` inside the exploration budget. **Browse ranks last while having the most affordances** — the same property [09 §6.3](../03-algorithms/09-exploration-and-prioritisation.md) makes on the reference shop, reproduced on a target we control so it can be asserted in `EC-02`.

### 2.5 Seeded data — fixed forever

```jsonc
// apps/sut/state/seed.json — regenerated identically by `forge seed`
{
  "currency": "INR", "symbol": "₹",
  "user": { "email": "ada@aperture.test", "name": "Ada Lovelace" },
  "cart": [
    { "sku": "APT-LC-01", "name": "Aperture Lens Cap", "unitPaise": 24900, "qty": 2 },
    { "sku": "APT-ST-02", "name": "Aperture Strap",    "unitPaise": 41200, "qty": 1 },
    { "sku": "APT-CL-03", "name": "Aperture Cloth",    "unitPaise": 20000, "qty": 1 }
  ],
  "coupons": { "SAVE10": { "percent": 10 } },
  "orderCounter": 1000
}
```

| Line | Amount |
|---|---|
| Subtotal | ₹1,110 |
| `SAVE10` (10%) | −₹111 |
| Shipping | Free |
| **Total** | **₹999** |

₹999 is not decoration. It is the exact string in veto `V3`'s canonical example ([13 §10](../03-algorithms/13-triage-and-healing.md)), and mutation `M-03` turns it into ₹9,999 — an edit distance of one that a naive text healer waves through and `V3` stops cold.

All money is integer **paise**; no floats anywhere in the target. A rounding difference between two runs would be indistinguishable from a product bug, and that is the one confusion this project cannot afford.

---

## 3. The `/checkout` DOM contract

**A contract, not a suggestion.** [13 §6](../03-algorithms/13-triage-and-healing.md) hard-codes this fingerprint and [16](16-agent-test-suite.md) asserts a heal score of `0.891` against it. Changing an ID here changes a number spoken out loud on stage.

```html
<body>
  <header id="site-header" role="banner">              <!-- [0,0,1440,76] -->
    <a href="/" class="brand">Aperture</a>
    <span id="session-meta">Session · IST</span>       <!-- static string -->
  </header>

  <main id="checkout-main" role="main">
    <h1 id="page-title">Checkout</h1>                  <!-- [120,124,400,44] -->

    <form id="checkout-form" role="form" aria-label="Checkout" method="post">

      <section id="delivery-section" aria-labelledby="delivery-heading">
        <h2 id="delivery-heading">Delivery</h2>
        <!-- name / address / city inputs, every one label-associated -->
      </section>

      <section id="coupon-section" aria-labelledby="coupon-heading">
        <h2 id="coupon-heading">Coupon</h2>
        <label for="coupon-input">Coupon code</label>
        <input id="coupon-input" name="coupon" type="text"
               placeholder="Enter coupon" aria-describedby="coupon-error">
        <button id="apply-coupon" type="submit" name="action" value="coupon">Apply</button>
        <p id="coupon-error" role="alert" hidden></p>
      </section>

      <div id="summary-col">
        <p id="order-ref">Draft #1000</p>

        <aside id="order-summary" role="region" aria-label="Order summary">
          <!-- one row per SKU + subtotal + discount -->
        </aside>

        <div id="total-row">                           <!-- [1040,640,280,32] -->
          <span id="total-label">Total</span>
          <span id="total-amount">₹999</span>
        </div>

        <div id="order-actions">                       <!-- [1040,704,280,96] -->
          <label id="terms-row">                       <!-- siblingIndex 0 -->
            <input type="checkbox" id="accept-terms" name="terms">
            I accept the terms
          </label>

          <button id="place-order" type="submit"       <!-- siblingIndex 1 -->
                  aria-label="Place order"
                  name="action" value="place">Place order</button>
                                                       <!-- [1080,728,220,48] -->
        </div>
      </div>
    </form>
  </main>
</body>
```

### 3.1 The anchor element

```
#place-order
  role                 button
  accessible name      "Place order"
  ancestorPath         main#checkout-main → form#checkout-form → div#order-actions
  siblingIndex         1                       (the terms row is 0)
  bbox                 { x:1080, y:728, w:220, h:48 }
  computedStyle        color #ffffff · background #4f39d6 · 16px/600 · inline-flex
```

Byte-identical to the fingerprint in [13 §6](../03-algorithms/13-triage-and-healing.md). `#order-actions` uses `padding: 0 20px 0 40px` and the button is `width: 220px`, which places its left edge at exactly 1080 inside a 280px column starting at 1040. That arithmetic is why `visualGeometry` scores `0.98` in the worked heal and not "about 1".

### 3.2 Determinism controls

| Source of drift | Control |
|---|---|
| Wall clock | `SUT_FROZEN_CLOCK=2026-01-01T00:00:00Z`; every rendered time derives from it |
| Order IDs | Monotonic counter from `seed.json`, reset to 1000 |
| Session line | Static string — no live time rendered anywhere |
| Fonts | Inter subset self-hosted as woff2 in `apps/sut/public/fonts/` — **never Google Fonts** |
| Animation | `*, *::before, *::after { animation: none !important; transition: none !important }` under `prefers-reduced-motion`, which Playwright forces |
| Scrollbars | `scrollbar-gutter: stable`, so their presence never shifts layout |
| Images | Fixed-dimension local SVGs; no remote assets, no lazy loading |

The font rule is the one that bites. A Google Fonts link makes geometry depend on venue wifi, and a fallback-font render shifts every text bbox by a few pixels — which moves `visualGeometry` and therefore moves a heal score that is asserted to `1e-6`.

---

## 4. The suite Aperture must satisfy

Not a fixture list — an oracle. These are the scenarios a competent QA engineer would write for this application, and the Planner is expected to arrive at broadly this set on its own.

| Capability | Scenario shape | Class | Exercises |
|---|---|---|---|
| Sign-in | Valid credentials reach the account | happy | `FR-101`, `FR-102` |
| Sign-in | **Invalid credentials show an error** | negative | **`M-12` → `V1`** |
| Browse | Product detail shows price and add-to-cart | happy | read-only surface |
| Cart | Adding two items updates the subtotal | happy | mutation |
| Cart | Empty cart blocks checkout | error_state | negative path |
| Checkout | `SAVE10` reduces the total to ₹999 | boundary | **`M-03` → `V3`** |
| Checkout | Invalid coupon shows an adjacent error | negative | `role="alert"` handling |
| Checkout | CTA disabled until terms accepted | boundary | `#accept-terms` → `#place-order` |
| Checkout | **Place order reaches confirmation** | happy | **the anchor · `M-01`, `M-02`** |
| Checkout | Confirmation displays an order reference | happy | **`M-06` → `V5`** |
| Account | Order history lists the placed order | happy | authenticated read |

---

## 5. The injectable-defect registry

The centrepiece of T1, and what turns *"let me break it live"* from a stunt into a controlled, reversible, audited operation.

### 5.1 Five principles

1. **A defect is data, never a source edit.** Nobody opens an editor on stage. `git status` on `apps/sut/src` stays clean through the entire demo — itself a claim a judge is invited to verify.
2. **Applied at render time.** A pure transform runs over the template's rendering context. No restart, no rebuild; the next page load carries the defect.
3. **Reversible in one command**, and reversed unconditionally by `forge reset`.
4. **Audited.** Every toggle appends to `state/mutations.log` with a timestamp. Asked *"what did you change?"*, we have a record — the demo itself is audited.
5. **The target never learns what FORGE expects.** Defects are described in Aperture's own vocabulary (`cta.id`, `total.amount`), never in FORGE's — no `EC-nn`, no locator strings, no veto ids. The build-enforced `sut-is-isolated` rule keeps this true.

Principle 5 is the anti-staging guarantee: `M-01` renames a DOM id. It has no idea a test ever referenced it.

### 5.2 The catalogue

| ID | Title | Effect | Fires | Case |
|---|---|---|---|---|
| **M-01** | CTA id rename | `#place-order` → `#btn-a7f3c9`; role, name, position and behaviour unchanged | heal @ **0.891** | **EC-05** |
| **M-02** | Destructive relabel | Label and `aria-label` → "Delete order" | **V2** | **EC-06** · *pair with M-01* |
| **M-03** | Price inflation | Total ₹999 → ₹9,999 | **V3** (and V1) | **EC-05** |
| **M-05** | Ambiguous siblings | CTA → "Submit order"; adds "Confirm order" in the same form | **V4** | **EC-04** |
| **M-06** | Order API 500 | `POST /api/orders` → 500 | **V5** | **EC-07** |
| **M-07** | Uncaught console error | Throws on checkout load | V5, console arm | EC-07 alt |
| **M-10** | Slow CTA | Button disabled for 4000 ms after load | `FLAKY` | EC-01 alt |
| **M-11** | Coupon relabel | "Coupon code" → "Promo code", `#coupon-input` → `#fld-3391` | a second heal | EC-05 repeat |
| **M-12** | **Auth error suppressed** | Invalid credentials render an empty `role="alert"` — the login silently fails | **V1** | **EC-06** |

**Retired with a destination.** `M-04` (promo banner shift), `M-08` (low-contrast CTA) and `M-09` (heading demotion) existed only to fire design checks `DC-04`, `DC-05`, `DC-06` and `DC-03`. Design intelligence is deferred ([ADR-013](../decisions/ADR-013-design-intelligence-deferred.md)), so those three retire with it and their specifications live in [deferred/](../deferred/design-intelligence.md). **Their ids are not reused** ([00 §5](../00-work-plan.md)).

**Conflict matrix** — mutually exclusive pairs are rejected at toggle time with `409` and a readable reason:

| | M-01 | M-02 | M-05 |
|---|---|---|---|
| **M-01** | — | allowed | **conflict** |
| **M-02** | allowed | — | **conflict** |
| **M-05** | **conflict** | **conflict** | — |

`M-05` rewrites the CTA's identity wholesale, so stacking it on `M-01` or `M-02` produces an incoherent scenario. Better to refuse at toggle time than to debug a nonsensical verdict on stage.

#### The three entries that earn their place

**`M-01` uses a fixed "random-looking" id.** `btn-a7f3c9` reads exactly like what a CSS-in-JS migration emits, while being byte-stable across runs. We get the visual story of a hashed id without sacrificing `NFR-1`.

**`M-05` is subtle, and should be.** Renaming the CTA to "Submit order" while adding "Confirm order" nearby produces two candidates at ≈0.72 and ≈0.70 — a 0.02 margin. Neither is obviously wrong; that is the point. `V4` escalates instead of flipping a coin, and *"the honest answer was: ask a human"* is a stronger beat than another green tick.

**`M-12` is new, and it is the cleanest `V1` case we have.** The pre-brief edition proved `V1` with the price mutation, which fires `V1` and `V3` together. That made a redundancy argument but a muddy test: removing `V1` entirely would leave the case green. `M-12` breaks an assertion **non-numerically** — expected `"Invalid email or password"`, actual `""` — so `V3` cannot fire and `V1` is the only thing standing between us and a healer that rewrites a truth claim.

> **The distinction `M-12` makes visible.** A copy change that breaks a *locator* is `CONTENT_DRIFT`. The same copy change that breaks an *assertion* is `PRODUCT_BUG` ([13 §3](../03-algorithms/13-triage-and-healing.md), rows 1 and 9). That is not an inconsistency: **if you asserted it, you claimed it mattered.** An application that silently swallows a failed login is broken, and the correct output is a defect report, not a rewritten expectation.

### 5.3 Control API — loopback only

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/__forge/mutations` | GET | — | Registry plus catalogue metadata |
| `/__forge/mutations/:id` | POST | `{enabled, params?}` | Updated entry, or `409` on conflict |
| `/__forge/reset` | POST | — | `{ok:true}` — all off, seed restored |
| `/__forge/panel` | GET | — | The presenter panel (§5.5) |
| `/__forge/health` | GET | — | `{ok, frozenClock, activeMutations[]}` |

```ts
// apps/sut/src/control/guard.ts
export function controlGuard(req: Request, res: Response, next: NextFunction) {
  const enabled = process.env.SUT_CONTROL_ENABLED === "true";
  const ip = req.socket.remoteAddress ?? "";
  const loopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

  // 404, not 403 — an unreachable endpoint should not advertise that it exists.
  if (!enabled || !loopback) return res.status(404).end();
  next();
}
```

A defect-injection endpoint reachable from the network is a genuinely dangerous thing to leave in a repository, regardless of intent. Two independent conditions gate it, it fails closed, and it denies its own existence.

### 5.4 The transform pipeline

```ts
// apps/sut/src/render/pipeline.ts
export type RenderContext = {
  page: "login" | "products" | "product" | "cart" | "checkout" | "order" | "orders";
  cta:    { id: string; label: string; ariaLabel: string; disabled: boolean; delayMs: number };
  total:  { amountPaise: number; display: string };
  auth:   { errorText: string | null };
  coupon: { label: string; inputId: string };
  extras: { duplicateCta: null | { id: string; label: string } };
  faults: { orderApiStatus: number; throwOnLoad: boolean };
};

export type Mutation = {
  id: string;
  title: string;
  conflicts: string[];
  apply: (ctx: RenderContext, params: Params) => RenderContext;   // pure
};

export const render = (base: RenderContext, active: ActiveMutations): RenderContext =>
  CATALOGUE
    .filter(m => active[m.id]?.enabled)
    .reduce((ctx, m) => m.apply(ctx, active[m.id]!.params), base);
```

Every `apply` is a **pure function on the render context**. Three consequences: mutations are unit-testable with no browser, composition order is explicit and deterministic, and no mutation can reach outside the render context to touch a file or a route handler. The registry is read through a 250 ms mtime-cached loader, so a toggle takes effect on the next request without a restart.

### 5.5 The presenter panel

`/__forge/panel`, opened on the **presenter's second screen** and never mirrored to the projector.

```
┌── APERTURE · CONTROL ───────────────────────── frozen 2026-01-01 ──┐
│                                                                    │
│   [1]  M-01  CTA id rename            ○ off      → heals           │
│   [2]  M-02  Destructive relabel      ○ off      → refuses  (V2)   │
│   [3]  M-03  Price inflation          ○ off      → refuses  (V3)   │
│   [4]  M-06  Order API 500            ○ off      → refuses  (V5)   │
│   [5]  M-12  Auth error suppressed    ○ off      → refuses  (V1)   │
│                                                                    │
│   [0]  RESET ALL                                                   │
│                                                                    │
│   log ▸ 10:12:04  M-01 enabled                                     │
└────────────────────────────────────────────────────────────────────┘
```

Number keys toggle, `0` resets. No mouse, no typing, no confirmation dialogs. Toggle latency budget: **under 200 ms to the next page render.** The entire design constraint is that the presenter's attention stays on the audience.

### 5.6 Reset (`NFR-9`)

`forge reset`, in order:

1. `POST /__forge/reset` — all mutations off, `mutations.log` rotated
2. Restore `apps/sut/state/seed.json` from `fixtures/sut/seed.json`
3. Restore generated suites from `fixtures/plans/` — **this is what undoes every heal**
4. Delete `artifacts/` and recreate the directory skeleton
5. Re-run SQLite migrations into a fresh `forge.db`
6. `GET /__forge/health` and `GET /checkout` — assert 200
7. Print one green line

Budget: **under 20 seconds**, verified in CI. Step 3 is the one people forget, and forgetting it is a specific, humiliating failure: the second rehearsal shows no heal, because the first rehearsal already healed the file.

---

## 6. T2 and T3 — the targets we do not own

### 6.1 The target profile format

A profile carries **how to reach a target, never how to test it.** No selectors, no route names, no expected text — those are exploration's job, every time, from scratch.

```jsonc
// targets/saucedemo.json — tracked; secrets live in the environment
{
  "id": "saucedemo",
  "name": "SauceDemo",
  "url": "https://www.saucedemo.com/",
  "credentials": { "usernameEnv": "T2_USER", "passwordEnv": "T2_PASS" },
  "budget": { "maxCapabilities": 6, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 400, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Public demo. Read-only by policy: no order is ever placed."
}
```

`disposable: false` is the field with teeth. It is what keeps `FR-209` honest on somebody else's application: destructive scenarios are planned, marked `plannedNotGenerated` with a reason, and reported as a known gap — never executed.

### 6.2 T2 · SauceDemo

| | |
|---|---|
| URL | `https://www.saucedemo.com/` |
| Credentials | `standard_user` / `secret_sauce` — published on the site's own landing page |
| Shape | Login → inventory → item detail → cart → a four-step checkout |
| Expected map | ~8 states, ~12 transitions, 4 capabilities |
| Disposable | **No.** Read-only: the checkout flow is planned and generated but the final *Finish* is deny-listed |

**What it catches that T1 cannot.** Aperture's login is a labelled form inside a `<form>` element — detector confidence `1.00`. SauceDemo's is a `<form>` with placeholder-driven inputs and a `input[type=submit]` styled as a button. Two structurally different login pages against one detector with zero configuration is `FR-101`'s acceptance criterion, and T3 supplies the third.

**Its limits, stated.** It is a public site we do not control: it can change without warning, it can be slow, and it cannot be broken on purpose. We assert the *shape* of the result — a map was produced, capabilities were named and ranked, a suite compiled and ran — never a specific score. A golden case that asserted `0.891` against somebody else's HTML would be a test that fails when they ship a release, which teaches the team to ignore it.

### 6.3 T3 · Conduit (RealWorld)

| | |
|---|---|
| Source | The RealWorld reference implementation — Express API + a server-rendered client |
| How we run it | **Locally**, `docker compose --profile targets up conduit`, on `:4200` |
| Fallback | The hosted demo instance, if the local image will not build |
| Credentials | Registered by the seed script at first boot: `forge@conduit.test` |
| Shape | Sign-in → feed → article → editor (create/edit/**delete**) → profile → settings |
| Expected map | ~10 states, ~16 transitions, 5 capabilities |
| Disposable | **Yes**, locally. `FORGE_DISPOSABLE_TARGET=true` is the only place we ever set it |

**Why it is run locally rather than hosted.** `Q-2` says assume venue internet is unreliable, and `NFR-2` says everything except plan quality works with no model access. A target that needs the internet would make our answer to *"can you demo without wifi?"* a qualified one. Running Conduit from a local image means the only network dependency in the entire demo is the model call — which is the sentence we want to be able to say.

**What it catches that neither other target can.** Conduit is the only target with genuine create-edit-delete surfaces. Three behaviours become observable there and nowhere else:

1. **The deny-list doing its job.** *Delete Article* is recorded as `observedNotExercised`, never pressed, and appears in the report as an untested flow with a stated reason (`FR-106`, `I-20`).
2. **`dependsOn` doing its job.** The editor capability depends on the sign-in capability, so `TG-4` holds a lap until its dependency banks ([ADR-012](../decisions/ADR-012-capability-lap.md) A1).
3. **The disposable opt-in doing its job.** With `FORGE_DISPOSABLE_TARGET=true` on a target we host, the deny-listed flows *are* exercised — which is the one place we can show that the safety default is a policy, not an inability.

---

## 7. The cold switch — rehearsal `R-3`

The organiser may hand us a URL on the day (`Q-1`). This is the drill, and it is timed.

```bash
# 1 · Profile — 30 seconds. No code, no rebuild.
cat > targets/day-of.json <<'JSON'
{ "id": "day-of", "name": "Organiser target", "url": "<their URL>",
  "credentials": { "usernameEnv": "T4_USER", "passwordEnv": "T4_PASS" },
  "budget": { "maxCapabilities": 8, "maxDurationMs": 600000, "maxUsd": 1.5 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false }
JSON

# 2 · Pre-flight — 30 seconds
pnpm forge doctor --target day-of      # reachable? auth shape? origin allowlisted?

# 3 · Run — the same command as every other target
pnpm forge run "<their URL>" --user "$T4_USER" --pass "$T4_PASS"
```

**Passes when:** a capability map, a ranked backlog, at least one banked lap and a report are produced within the budget, with **zero code changes and zero configuration beyond the profile**. `S-1` is measured here.

| Failure on the day | What happens |
|---|---|
| Unreachable, or behind a VPN | Classified `ENVIRONMENT`, never `PRODUCT_BUG`. Fall back to T1 and say why out loud |
| Login not detected | Session proceeds unauthenticated with `authenticated: false` in the report ([09 §2.2](../03-algorithms/09-exploration-and-prioritisation.md)) — half a map, honestly labelled |
| Rate-limits us (`429`) | Politeness throttle backs off; the frontier budget is unchanged (`Q-3`) |
| One capability is a swamp | Its lap banks `PARTIAL` or `LAP_FAILED`; the session continues (`FR-905`) |
| Exploration finds almost nothing | `TG-2` degrades to one synthetic capability. Still a run, still a report |

**Not one of those rows is `ERROR`.** That is the property `R-3` actually rehearses: there is no target for which the correct behaviour is a crash.

---

## 8. Pointing at somebody else's application

Running an autonomous crawler against an application we do not own is the part of this project with real-world consequences, and the defaults reflect that.

| Rule | Mechanism |
|---|---|
| Never submit a destructive action | The verb deny-list blocks submission; the affordance is recorded, not dropped (`FR-106`) |
| Stay on the origin | Off-origin navigation returns `OFF_ORIGIN`, is recorded, and the crawl returns (`FR-109`) |
| One tab, throttled | `maxConcurrency: 1`, `minDelayMs` from the profile. We are a visitor, not a load test |
| Back off, don't retry harder | `429` or `503` widens the delay and consumes frontier budget rather than hammering |
| Nothing durable is written | No account creation, no orders placed, no content published on a non-disposable target |
| Credentials never land on disk | In memory and in `storageState` only; the emitted suite reads `process.env` (`FR-006`, `I-16`) |

**Say this out loud in the demo.** The line *"it found the delete button, and it did not press it"* is a stronger claim about engineering judgement than any coverage number, and T3 is the target that lets us show it rather than assert it.

---

## 9. Acceptance criteria

**T1 · Aperture**

- [ ] `/checkout` renders every ID, role and accessible name in §3 exactly as written
- [ ] The anchor element's bbox is `[1080,728,220,48]` at 1440×900, `deviceScaleFactor: 1`, within ±2 px
- [ ] Two consecutive screenshots of a clean `/checkout` are byte-identical (`sha256` equal)
- [ ] Exploration yields ≥ 11 states, ≥ 14 transitions and the five capabilities of §2.4, ranked in that order
- [ ] All nine mutations toggle in under 200 ms with no restart
- [ ] Conflicting mutations return `409` with a readable reason
- [ ] `/__forge/*` returns `404` from any non-loopback address, and when `SUT_CONTROL_ENABLED=false`
- [ ] `git status` on `apps/sut/src` stays clean after every mutation
- [ ] `forge reset` completes under 20 s and restores healed spec files
- [ ] Zero remote network requests on page load
- [ ] No floating-point arithmetic anywhere in money handling

**T2 · SauceDemo and T3 · Conduit**

- [ ] Login is detected with no configuration on both (`FR-101`)
- [ ] Each yields ≥ 4 capabilities with a total ordering that is identical across five runs (`I-17`)
- [ ] No destructive affordance is exercised on either while `disposable: false`
- [ ] A full session on each produces a report with all five mandated contents
- [ ] Conduit runs with the internet disconnected

**The roster**

- [ ] `packages/**` contains no literal from any target (§1.1)
- [ ] `R-3` completes on a target nobody has run before, with no code change

---

## 10. Known limitations

| Limitation | Impact | Stated answer |
|---|---|---|
| T1 is server-rendered, so hydration bugs are out of reach | We never test the class of failure SPAs actually have | T2 and T3 are not ours and not tuned for us; and the trade buys `NFR-1`, which the demo cannot survive without |
| T2 can change or go down without warning | A golden case against it would flake | We assert shape, never numbers, and T2 is never on the 7/7 gate |
| Three targets is not "any web application" | The generalisation claim is bounded | Say *"validated on three applications of different shape, one of which we did not build"* — never *"works on any web app"* |
| Injectable defects are ours, so they are the defects we imagined | The classifier is tuned on failures we invented | Volunteered unprompted. The pre-classifier's ten rows are the falsifiable part: they are stated, and a judge can propose a failure and check which row catches it |
| Conduit is a reference app, not a production one | Its DOM is cleaner than reality | True of every demo target. The honest mitigation is T2, whose DOM nobody designed for testability either |

---

## 11. Related documents

- Why we build a target at all → [ADR-007](../decisions/ADR-007-demo-app.md)
- What the Explorer does with a URL → [09 · Exploration & Prioritisation](../03-algorithms/09-exploration-and-prioritisation.md)
- The deny-list constant and why it is not the healing lexicon → [08 §4.1](../02-architecture/08-perception-layer.md)
- The fingerprint this DOM contract must match → [13 §6](../03-algorithms/13-triage-and-healing.md)
- The cases that toggle these mutations → [16 §5](16-agent-test-suite.md)
- Where `R-3` sits in the day → [22 · Demo Runbook](../05-delivery/22-demo-runbook.md)
