# Fork & Flame — a restaurant ordering app, built to be tested

> **What this is.** A product/build specification for a second FORGE target application: a real, publicly deployed Next.js ordering site — `fork-and-flame.vercel.app` — that ships with a catalogue of intentionally seeded, reversible bugs. Where [Aperture](../../04-build/19-target-apps.md) (`apps/sut`, T1) is a server-rendered fixture optimised for pixel-perfect determinism, Fork & Flame is optimised for the opposite: real hydration, real client-side routing, real Vercel cold starts — the shape of application FORGE will actually meet in the wild, with the one thing the wild never gives you: a controllable defect.
> **What this is not.** Implementation. Nothing here has been built yet. This document is written the way [19 · Target Applications](../../04-build/19-target-apps.md) was written before Aperture existed — prescriptive enough that a builder (human or agent) can go straight to code, and precise enough that the DOM contract can be asserted on day one.
> **Where this lives.** This file is meant to travel. Copy this folder into its own repository when you scaffold the project, and this document becomes that repository's root `README.md` unchanged.

---

## 1. Why this exists

FORGE's own roster ([19 §1](../../04-build/19-target-apps.md)) is deliberately three targets of different shape: a mutable fixture we control (Aperture), a public demo we don't (SauceDemo), and a self-hosted CRUD reference app (Conduit). Each earns its place by having a property the others lack.

Fork & Flame earns a fourth: **it is ours, mutable, *and* deployed** — a live URL on the public internet, built with the framework most real targets are actually built with today.

| | Aperture (T1) | SauceDemo (T2) | Conduit (T3) | **Fork & Flame** |
|---|---|---|---|---|
| Ours to modify | ✅ | ❌ | partially (fork) | ✅ |
| Injectable defects | ✅ | ❌ | ❌ | ✅ |
| Rendering model | Server-rendered, zero hydration | Unknown legacy stack | Server-rendered reference app | **Next.js App Router — real hydration, client routing, streaming** |
| Reachable from anywhere | No (`:4100`, local) | Yes | No (local, disposable) | **Yes — a real Vercel URL, cold starts and all** |
| The claim it earns | *"We can prove refusal-to-heal on demand."* | *"It works on a target we never touched."* | *"It declines to press the dangerous button."* | **"It works on a live, framework-rendered app with the DOM churn Aperture was built to avoid — and we can still break it on purpose."** |

Aperture's own spec is explicit that trading realism for determinism was a deliberate, documented cost ([19 §2.2](../../04-build/19-target-apps.md)): *"T2 and T3 supply the realism T1 gives up."* Fork & Flame is the target that supplies that realism **and** keeps the injectability that makes `B2` (telling a broken test from a broken product) demonstrable. Formally slotting it into FORGE's frozen roster as a `T4` — updating [19](../../04-build/19-target-apps.md), the ID index, and `targets/` — is a follow-up change to that document and is out of scope here; this spec only defines the application itself.

---

## 2. The product

**Fork & Flame** — *"Wood-fired comfort food, delivered."*

A fictional single-location restaurant (Ferndale, no real address) selling wood-grilled burgers, flatbreads, bowls, and shakes, ordered online for delivery or pickup. One restaurant, one menu, no marketplace, no multi-tenant anything — depth over breadth, same principle Aperture applies to its three fixed SKUs ([19 §2.3](../../04-build/19-target-apps.md)).

**Personas the flows are written for:**
- **A guest** who wants to order once without creating an account.
- **A returning customer** who signs in, has a saved address, and reorders.
- **Nobody is staff-facing.** There is no kitchen dashboard, no admin console, no multi-restaurant anything — see §3.2.

---

## 3. Scope

### 3.1 In scope (the MVP surface)

| Capability | What it covers |
|---|---|
| **Browse** | Menu grouped by category, item detail with size/add-on customisation |
| **Cart** | Add/remove/adjust quantity, line-item customisation summary, promo code |
| **Checkout** | Delivery vs. pickup, address entry, tip selection, terms acceptance, place order |
| **Order tracking** | A live-looking status timeline, time-boxed cancellation |
| **Account** | Sign up / sign in, saved addresses, order history, reorder |

### 3.2 Out of scope — deliberately

| Cut | Why |
|---|---|
| Real payment processing | A fake, always-succeeds test gateway is used instead — see §7. Nobody needs a real Stripe account to run this |
| Multi-restaurant / marketplace | One menu keeps the state space legible, the same reasoning Aperture gives for three SKUs |
| Staff / kitchen dashboard | No second user role. Adding one doubles the auth surface for no testing benefit |
| Table reservations | A plausible restaurant feature, deliberately deferred — it would add a whole booking-calendar state space that duplicates what checkout already exercises |
| Real delivery logistics, maps, live courier tracking | The status timeline is a deterministic state machine, not a live feed — see §8 |
| Delete-account flow | Destructive and irreversible for a shared demo login; permanently excluded from automation regardless of `disposable` (§9) |

The target is not the product here either — the same sentence Aperture's spec uses ([19 §2.2](../../04-build/19-target-apps.md)) about itself applies to this one too. Nobody evaluates Fork & Flame; they evaluate whether FORGE's verdict about it was right.

---

## 4. Tech stack

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | The realism this target exists to supply — hydration, client navigation, streaming |
| Styling | Tailwind CSS | Fast to build, keeps class names stable and greppable for the DOM contract |
| Data | Postgres (Neon or Vercel Postgres) via Prisma | Serverless-safe; SQLite-on-disk doesn't survive a Vercel deployment's ephemeral filesystem the way it does for Aperture's long-lived local process |
| Auth | A minimal credentials-only session (signed cookie, `iron-session` or hand-rolled JWT) | No OAuth providers — one less thing that depends on a third party being up during a run |
| Cart state | Server-persisted against a session id, mirrored to `localStorage` only as a same-tab convenience | FORGE explores cold; a cart that only lives in client memory would vanish on navigation and read as a product bug that isn't one |
| Payments | An in-repo fake gateway, `lib/testpay.ts` | Deterministic, offline-safe, and it fails on command (§7) — a real Stripe test key would add a network dependency this target doesn't need |
| Fonts | Inter, self-hosted `woff2` under `public/fonts/` | Same reasoning as Aperture ([19 §3.2](../../04-build/19-target-apps.md)): a Google Fonts request makes text geometry depend on the venue's network, which moves any pixel-anchored assertion |
| Images | Fixed-dimension local SVG/WebP, no remote hosts | No `next/image` remote loader, no lazy-load layout shift |
| Hosting | Vercel, `fork-and-flame.vercel.app` | The whole point — a live URL FORGE reaches like any other |

All money is handled as **integer cents**, never floats, for the identical reason Aperture bans floating-point paise ([19 §2.5](../../04-build/19-target-apps.md)): a rounding difference between two runs is indistinguishable from a real defect, and that is the one ambiguity this target cannot afford either.

---

## 5. Route map

| Route | Purpose | Auth |
|---|---|---|
| `/` | Menu, grouped by category | — |
| `/menu/[category]` | Filtered menu view | — |
| `/item/[sku]` | Item detail — size, add-ons, add to cart | — |
| `/cart` | Cart contents, quantity, promo code | — |
| `/checkout` | **The screen the anchor lives on.** Fulfilment choice, address, tip, place order | soft¹ |
| `/order/[id]` | Confirmation and live-looking status timeline; time-boxed cancel | soft¹ |
| `/login` · `/signup` | Credentials auth | — |
| `/account` | Profile summary | ✅ |
| `/account/orders` | Order history, reorder | ✅ |
| `/account/addresses` | Saved addresses, add/edit/**delete** | ✅ |
| `/api/cart`, `/api/promo`, `/api/orders`, `/api/orders/[id]/cancel` | JSON endpoints backing the above | mixed |
| `/api/control/*` | Control plane — §9. Hidden, header-gated | — |

¹ **"Soft" auth is a deliberate quirk, not an oversight.** Checkout works for a guest; an account is only required to *see order history later*. This gives FORGE two structurally different paths to the same checkout capability — guest and authenticated — the same kind of branching Aperture's login-gated checkout doesn't have room for, and it is exactly the sort of thing an exploration pass should discover on its own rather than being told about.

---

## 6. Core user flows

1. **Browse.** Land on `/`, filter by category, open an item, pick a size/add-on combination, add to cart. Price updates live with the selected customisation.
2. **Cart.** Adjust quantity or remove a line item; apply a promo code (`FLAME10`); see subtotal, discount, and a running total. Empty cart disables checkout with a stated reason, not a dead link.
3. **Checkout.** Choose delivery or pickup. Delivery reveals an address form; pickup reveals a time-slot picker instead — **the same form element is repurposed, not duplicated**, which is a deliberate structural echo of Aperture's single `#checkout-form` and a fair test of whether exploration tracks state correctly across a conditional render. Pick a tip preset (or none), accept terms, place order.
4. **Confirmation & tracking.** Land on `/order/[id]` with an order number and an ETA. The status advances through a fixed timeline (§8). Within a grace window, a **Cancel order** button is visible; after it, the button is gone, not merely disabled — the affordance itself changes with state.
5. **Account.** Sign up or sign in; see past orders; **Reorder** repopulates the cart from a historical order; manage saved addresses, including **deleting one**.

---

## 7. The fake payment gateway

```ts
// lib/testpay.ts — the only "payment provider" this target has
export type ChargeResult = { ok: true; ref: string } | { ok: false; reason: string };

export async function charge(amountCents: number, card: TestCard): Promise<ChargeResult> {
  if (card.number === "4000000000000002") return { ok: false, reason: "card_declined" }; // always-decline test card
  return { ok: true, ref: `ch_${monotonicCounter()}` };
}
```

The checkout form is pre-filled with a always-succeeds test card (`4242 4242 4242 4242`) so a golden happy-path scenario never has to type anything, and a second, published always-declines card exists for the one deliberate negative-path scenario in §10. No network call, no real processor, no dependency on a third party's uptime during a demo run — the same "the only network dependency in the room is the model call" argument Conduit's spec makes for running locally ([19 §6.3](../../04-build/19-target-apps.md)), applied here to payments instead of hosting.

---

## 8. Order status timeline — deterministic, not live

A real delivery tracker ticks on wall-clock time and network events; neither is acceptable here for the same reason Aperture freezes its clock ([19 §3.2](../../04-build/19-target-apps.md)). The timeline instead advances on a **fixed schedule measured from `placedAt`**, computed from `SUT_FROZEN_CLOCK` when set:

| Status | Offset from `placedAt` | Cancellable? |
|---|---|---|
| `RECEIVED` | 0s | ✅ |
| `PREPARING` | +90s | ✅ until +120s |
| `OUT_FOR_DELIVERY` / `READY_FOR_PICKUP` | +420s | ❌ |
| `DELIVERED` / `PICKED_UP` | +900s | ❌ |

The **Cancel order** button's visibility is a pure function of `now - placedAt < 120s`, itself a pure function of the frozen clock in test mode — so a scenario that asserts "cancel disappears after the grace window" never has to actually wait two minutes.

---

## 9. Deny-listed destructive actions

Two genuinely destructive affordances exist on purpose, mirroring the role Conduit's *Delete Article* plays for FORGE's exploration deny-list ([19 §1](../../04-build/19-target-apps.md), [08 §4.1](../../02-architecture/08-perception-layer.md)):

| Affordance | Where | Exercised when `disposable: true`? |
|---|---|---|
| **Cancel order** | `/order/[id]`, within the grace window | Yes — it's our seeded data, and this is the flow the timeline in §8 exists to make safely repeatable |
| **Delete saved address** | `/account/addresses` | Yes, on a seeded non-default address only |
| **Delete account** | *(does not exist as a reachable button in the MVP — see §3.2)* | Never. Deliberately not built rather than deny-listed, because a control that only works by policy is weaker than one that doesn't exist |

Recording *"it found Cancel order, and — outside disposable mode — it did not press it"* is the same beat Aperture's spec calls out as a stronger claim than a coverage number ([19 §8](../../04-build/19-target-apps.md)); Fork & Flame is where that claim gets made against a target with real client-side state instead of a full-page reload.

---

## 10. Seed data — fixed, deterministic

```jsonc
// fixtures/seed.json — restored identically by the reset endpoint (§12)
{
  "currency": "USD", "symbol": "$",
  "user": { "email": "sam@forkandflame.test", "name": "Sam Rivera" },
  "menu": [
    { "sku": "FF-BRG-01", "name": "Ember Smash Burger",      "category": "mains",    "unitCents": 1100 },
    { "sku": "FF-FLB-02", "name": "Wild Mushroom Flatbread", "category": "flatbreads","unitCents": 1300 },
    { "sku": "FF-SHK-03", "name": "Salted Caramel Shake",    "category": "drinks",   "unitCents": 500 },
    { "sku": "FF-WNG-04", "name": "Charred Wings",           "category": "starters", "unitCents": 950 },
    { "sku": "FF-BWL-05", "name": "Char-Grilled Veggie Bowl","category": "bowls",    "unitCents": 1000 },
    { "sku": "FF-DST-06", "name": "Chocolate Lava Cake",     "category": "desserts", "unitCents": 700 }
  ],
  "cart": [
    { "sku": "FF-BRG-01", "qty": 2 },
    { "sku": "FF-FLB-02", "qty": 1 },
    { "sku": "FF-SHK-03", "qty": 1 }
  ],
  "coupons": { "FLAME10": { "percent": 10 } },
  "deliveryFeeCents": 300,
  "orderCounter": 5000
}
```

| Line | Amount |
|---|---|
| Subtotal (2×$11.00 + $13.00 + $5.00) | $40.00 |
| `FLAME10` (10%) | −$4.00 |
| Delivery fee | +$3.00 |
| Tip (golden path: "No tip") | $0.00 |
| **Total** | **$39.00** |

`$39.00` plays the same role here that `₹999` plays in Aperture ([19 §2.5](../../04-build/19-target-apps.md)): it is the literal string a healer must reproduce exactly, and the exact string `RB-03` (§11) corrupts by one digit's worth of magnitude.

---

## 11. The `/checkout` DOM contract

A contract, not a suggestion — the same status Aperture gives its own ([19 §3](../../04-build/19-target-apps.md)). Any future healing-score worked example against this target hard-codes this fingerprint; changing an id here is a breaking change to that example.

```html
<body>
  <header id="site-header" role="banner">
    <a href="/" class="brand">Fork &amp; Flame</a>
    <span id="fulfillment-badge">Delivering to · 94107</span>
  </header>

  <main id="checkout-main" role="main">
    <h1 id="page-title">Checkout</h1>

    <form id="checkout-form" role="form" aria-label="Checkout" method="post">

      <section id="fulfillment-section" aria-labelledby="fulfillment-heading">
        <h2 id="fulfillment-heading">Delivery or pickup</h2>
        <!-- radiogroup: #fulfillment-delivery / #fulfillment-pickup -->
      </section>

      <section id="address-section" aria-labelledby="address-heading">
        <h2 id="address-heading">Delivery address</h2>
        <!-- street / city / zip inputs, every one label-associated -->
      </section>

      <section id="promo-section" aria-labelledby="promo-heading">
        <h2 id="promo-heading">Promo code</h2>
        <label for="promo-input">Promo code</label>
        <input id="promo-input" name="promo" type="text"
               placeholder="Enter code" aria-describedby="promo-error">
        <button id="apply-promo" type="submit" name="action" value="promo">Apply</button>
        <p id="promo-error" role="alert" hidden></p>
      </section>

      <section id="tip-section" aria-labelledby="tip-heading">
        <h2 id="tip-heading">Add a tip</h2>
        <!-- preset buttons: #tip-0, #tip-15, #tip-18, #tip-20 -->
      </section>

      <div id="summary-col">
        <p id="order-ref">Order #5000 (draft)</p>

        <aside id="order-summary" role="region" aria-label="Order summary">
          <!-- one row per line item + subtotal + discount + delivery fee + tip -->
        </aside>

        <div id="total-row">                          <!-- target bbox [1040,612,280,32] -->
          <span id="total-label">Total</span>
          <span id="total-amount">$39.00</span>
        </div>

        <div id="order-actions">                      <!-- target bbox [1040,676,280,96] -->
          <label id="terms-row">                      <!-- siblingIndex 0 -->
            <input type="checkbox" id="accept-terms" name="terms">
            I agree to the order terms
          </label>

          <button id="place-order" type="submit"      <!-- siblingIndex 1 -->
                  aria-label="Place order"
                  name="action" value="place">Place order</button>
                                                       <!-- target bbox [1084,700,220,48] -->
        </div>
      </div>
    </form>
  </main>
</body>
```

### 11.1 The anchor element

```
#place-order
  role                 button
  accessible name      "Place order"
  ancestorPath         main#checkout-main → form#checkout-form → div#order-actions
  siblingIndex         1                       (the terms row is 0)
  bbox (target)        { x:1084, y:700, w:220, h:48 }   at 1440×900, deviceScaleFactor 1
  computedStyle        color #ffffff · background #c2410c · 16px/600 · inline-flex
```

The bbox is a **build target**, not yet a measured fact — pin it with the first visual-regression baseline once the page exists, the same way Aperture's own fingerprint became load-bearing only after the app was built. `#order-actions` padding and `#place-order`'s fixed width are chosen so the numbers above fall out of the layout exactly, not by manual pixel-nudging afterward.

### 11.2 Determinism controls

| Source of drift | Control |
|---|---|
| Wall clock | `SUT_FROZEN_CLOCK=2026-01-01T00:00:00Z`; the status timeline (§8) and every rendered timestamp derive from it |
| Order IDs | Monotonic counter from `seed.json`, reset to `5000` |
| Fonts | Inter subset, self-hosted `woff2` — never a Google Fonts request |
| Animation | `*, *::before, *::after { animation: none !important; transition: none !important }` under `prefers-reduced-motion`, which Playwright forces |
| Hydration | Accepted as nondeterminism *within a run* (attribute ordering, etc.) but the **rendered output** is deterministic given seed + frozen clock — perception should key off accessible name/role/ancestor path, never raw markup, which this target is specifically here to force |
| Images | Fixed-dimension local assets; no remote hosts, no lazy loading |
| Cold starts | `GET /api/control/health` is the warm-up call before any timed run — a cold Vercel function is a latency fact, not a defect, and should never be scored as one |

---

## 12. Control plane

Aperture gates its control surface on loopback ([19 §5.3](../../04-build/19-target-apps.md)); a Vercel deployment has no loopback to check, so the same five principles ([19 §5.1](../../04-build/19-target-apps.md)) are enforced with a header secret instead, fail-closed the same way:

```ts
// app/api/control/guard.ts
export function controlGuard(req: NextRequest) {
  const enabled = process.env.CONTROL_ENABLED === "true";
  const key = req.headers.get("x-control-key");
  const expected = process.env.CONTROL_SECRET;

  // 404, not 403 — an unreachable endpoint should not advertise that it exists.
  if (!enabled || !expected || key !== expected) return notFoundResponse();
}
```

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/control/mutations` | GET | — | Registry plus catalogue metadata |
| `/api/control/mutations/[id]` | POST | `{enabled, params?}` | Updated entry, or `409` on conflict |
| `/api/control/reset` | POST | — | `{ok:true}` — all off, seed restored |
| `/api/control/health` | GET | — | `{ok, frozenClock, activeMutations[]}` |

Every mutation is a **pure transform over a render context**, exactly Aperture's pattern ([19 §5.4](../../04-build/19-target-apps.md)) — no source edit, no restart, one command to reverse, and every toggle appended to a `mutations.log` so the demo remains its own audit trail.

---

## 13. The QA oracle

The scenarios a competent QA engineer would write for this application — and, per Aperture's own framing ([19 §4](../../04-build/19-target-apps.md)), broadly what an automated planner is expected to arrive at unprompted.

| Capability | Scenario shape | Class | Exercises |
|---|---|---|---|
| Auth | Sign up, then sign in, reaches account | happy | soft-auth boundary |
| Auth | **Wrong password shows an error** | negative | **`RB-06` → truth-claim veto** |
| Browse | Item detail price updates when a size is changed | happy | customisation state |
| Cart | Adding two items updates the subtotal | happy | mutation |
| Cart | Empty cart blocks checkout with a stated reason | error_state | negative path |
| Checkout | `FLAME10` reduces the total to exactly $39.00 | boundary | **`RB-03` → financial veto** |
| Checkout | Invalid promo code shows an adjacent error | negative | `role="alert"` handling |
| Checkout | Switching pickup ↔ delivery swaps the form section without losing the cart | boundary | conditional-render tracking |
| Checkout | CTA disabled until terms accepted | boundary | `#accept-terms` → `#place-order` |
| Checkout | **Place order reaches confirmation** | happy | **the anchor · `RB-01`, `RB-02`** |
| Checkout | Declined test card shows a payment error, order not created | negative | `RB-05`'s honest counterpart |
| Tracking | Cancel is visible inside the grace window and gone after it | boundary | §8's pure function of frozen clock |
| Account | Order history lists the placed order; Reorder repopulates the cart | happy | authenticated read + mutation |
| Account | Deleting a non-default address removes it from the list | happy (disposable only) | the deny-listed affordance, exercised deliberately |

---

## 14. The injectable-defect catalogue

The centrepiece, same charter as Aperture's ([19 §5](../../04-build/19-target-apps.md)): a defect is data, applied at render time, reversible in one command, audited, and described only in Fork & Flame's own vocabulary — never in FORGE's.

| ID | Title | Effect | Expected outcome |
|---|---|---|---|
| **RB-01** | CTA id rename | `#place-order` → `#btn-9d21f4`; role, name, position, behaviour unchanged | **Heals** — `CONTENT_DRIFT`, high-confidence candidate |
| **RB-02** | Mislabelled destructive action | `#remove-item`'s label/`aria-label` → "Save for later" while it still deletes the line | **Refuses** — destructive-relabel veto |
| **RB-03** | Price inflation | `#total-amount` renders `$390.00` in place of `$39.00`; the amount actually charged is unchanged | **Refuses** — financial-mismatch veto |
| **RB-04** | Ambiguous duplicate CTA | Adds a second, near-identical `#confirm-order` ("Confirm order") beside `#place-order` | **Escalates** — two plausible candidates, neither clearly right |
| **RB-05** | Order API failure | `POST /api/orders` → `500` | **Refuses** — environment/server-error veto |
| **RB-06** | Suppressed auth error | A wrong password renders an empty `role="alert"` instead of "Incorrect email or password" | **Refuses** — the login silently "succeeds" at failing; a truth-claim veto, not a locator problem |
| **RB-07** | Slow add-to-cart | `#add-to-cart` stays disabled for 4000 ms after the click | Classified **flaky**, not healed and not vetoed |
| **RB-08** | Field relabel | "Promo code" → "Gift card"; `#promo-input` → `#fld-code-2` | **Heals** — a second, independent `CONTENT_DRIFT` case |
| **RB-09** | Uncaught console error | `/order/[id]` throws on load | **Refuses** — console-armed defect |

**Conflicts.** `RB-04` rewrites the checkout CTA's identity wholesale, the same way Aperture's `M-05` does ([19 §5.2](../../04-build/19-target-apps.md)), and is therefore mutually exclusive with `RB-01` and `RB-02` — stacking them produces an incoherent scenario, and the toggle endpoint should refuse the combination at `409` rather than let a demo debug a nonsense verdict live.

**The one worth reading twice: `RB-06`.** It is this catalogue's version of Aperture's `M-12` argument ([19 §5.2](../../04-build/19-target-apps.md)): a copy change that breaks a *locator* is content drift; the identical change breaking an *assertion* is a product defect, because asserting the message in the first place was the claim that it mattered. An app that silently swallows a failed login is broken, and the correct output is a defect report — never a rewritten expectation.

---

## 15. Target profile — for FORGE's `targets/`

```jsonc
// targets/fork-and-flame.json — tracked; secrets live in the environment
{
  "id": "fork-and-flame",
  "name": "Fork & Flame",
  "url": "https://fork-and-flame.vercel.app/",
  "credentials": { "usernameEnv": "FF_USER", "passwordEnv": "FF_PASS" },
  "budget": { "maxCapabilities": 8, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 300, "maxConcurrency": 1 },
  "disposable": true,
  "notes": "Ours, hosted, mutable via /api/control. Cancel-order and delete-address may be exercised."
}
```

---

## 16. Suggested repository layout

```
fork-and-flame/
  app/
    (site)/
      page.tsx                       # menu
      menu/[category]/page.tsx
      item/[sku]/page.tsx
      cart/page.tsx
      checkout/page.tsx
      order/[id]/page.tsx
      login/page.tsx
      signup/page.tsx
      account/
        page.tsx
        orders/page.tsx
        addresses/page.tsx
    api/
      cart/route.ts
      promo/route.ts
      orders/route.ts
      orders/[id]/cancel/route.ts
      addresses/[id]/route.ts
      control/
        guard.ts
        mutations/route.ts
        mutations/[id]/route.ts
        reset/route.ts
        health/route.ts
  lib/
    render/
      pipeline.ts                    # pure mutation composition, mirrors Aperture's pattern
      mutations/
        rb-01-cta-id-rename.ts
        rb-02-mislabel-remove.ts
        rb-03-price-inflation.ts
        rb-04-duplicate-cta.ts
        rb-05-order-500.ts
        rb-06-suppressed-auth-error.ts
        rb-07-slow-add-to-cart.ts
        rb-08-promo-relabel.ts
        rb-09-console-error.ts
    money.ts                         # integer-cents arithmetic only
    testpay.ts                       # §7
    clock.ts                         # SUT_FROZEN_CLOCK
  prisma/
    schema.prisma
    seed.ts
  public/fonts/
  fixtures/
    seed.json
  targets/
    fork-and-flame.json              # copy into FORGE's own targets/ once deployed
```

---

## 17. Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SUT_FROZEN_CLOCK` | ISO timestamp; unset in production, fixed in test mode |
| `CONTROL_ENABLED` | `"true"` to expose `/api/control/*`; unset in production-facing deployments |
| `CONTROL_SECRET` | Bearer value checked against `x-control-key` |
| `SESSION_SECRET` | Signs the auth cookie |
| `FF_USER` / `FF_PASS` | Seed login, referenced by `targets/fork-and-flame.json`, never hardcoded in app code |

---

## 18. Acceptance criteria

- [ ] `/checkout` renders every id, role, and accessible name in §11 exactly as written
- [ ] Two consecutive orders placed with identical inputs produce byte-identical totals
- [ ] Exploration of a clean deployment yields ≥ 6 capabilities across the flows in §6, with Checkout ranked above Browse
- [ ] All nine `RB-nn` mutations toggle in under 200 ms with no redeploy
- [ ] Conflicting mutations return `409` with a readable reason
- [ ] `/api/control/*` returns `404` from any request missing or mismatching `x-control-key`, and whenever `CONTROL_ENABLED` is unset
- [ ] `/api/control/reset` completes in under 20 seconds and restores seed data, including any previously deleted address
- [ ] No floating-point arithmetic anywhere in money handling
- [ ] Cancel order is visible only while `now - placedAt < 120s`, computed from `SUT_FROZEN_CLOCK` in test mode
- [ ] Delete account is not a reachable affordance anywhere in the UI

---

## 19. Known limitations, stated up front

| Limitation | Impact | Stated answer |
|---|---|---|
| Hydration is real, so DOM churn is real | Perception must key off role/name/ancestor path, not raw markup — this is the point, not a gap | Aperture already proves the deterministic case; this target proves the framework-noise case |
| Vercel cold starts add latency variance | A slow first request could misread as `FLAKY` | `/api/control/health` is a mandatory warm-up call before any timed run, never scored |
| A hosted Postgres instance is a second moving part beyond the app itself | Its own outage would look like the target being unreachable | Classified `ENVIRONMENT`, exactly as [19 §7](../../04-build/19-target-apps.md) directs for any unreachable target — never `PRODUCT_BUG` |
| The bug catalogue is ours, so it's the bugs we imagined | Same limitation Aperture states about its own `M-nn` set | Volunteered unprompted, same as [19 §10](../../04-build/19-target-apps.md): the pre-classifier's rows are the falsifiable part |

---

## 20. Related documents

- The sibling target this one is deliberately unlike → [19 · Target Applications](../../04-build/19-target-apps.md)
- The healing ladder and veto definitions each `RB-nn` is written to exercise → [13 · Triage & Healing](../../03-algorithms/13-triage-and-healing.md)
- The perception layer this target is built to stress → [08 · Perception Layer](../../02-architecture/08-perception-layer.md)
