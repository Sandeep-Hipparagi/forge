# External Target Platforms

> **What this is.** A research supplement to [19 · Target Applications](../04-build/19-target-apps.md): a catalogue of external, publicly reachable practice applications for development-time validation and rehearsal — bug-detection sanity checks, extra UI-pattern coverage, and a wider pool for cold-switch drills, beyond the canonical three.
> **What this is not.** A fourth canonical target, a change to the golden-case gate, or a modification to Aperture's DOM contract, the `M-nn` mutation catalogue, or the `R-3` cold-switch procedure. Nothing here is toggleable the way `M-nn` is: a bug on someone else's site is either present today or it isn't, there is no `POST /mutations/:id` for it, and only T1–T3 plus the day-of URL are load-bearing for the demo ([19 §1](../04-build/19-target-apps.md)).
> **Confidence.** Every characterisation below rests on published descriptions plus one fetch-based sanity check (§3). None of these ten has been driven through FORGE's own Explorer. Treat every row as a hypothesis, exactly the way [19 §7](../04-build/19-target-apps.md) treats a day-of URL: `forge doctor --target <id>`, then one real exploration pass, before any claim here is relied on.
> **This document owns:** the external-platform catalogue, the `EXT-nn` id family, and the wave-based validation sequence in §6. It must never duplicate or override the `M-nn` defect registry, the DOM contract, or any `EC-nn` golden-case assertion — those stay singly owned by [19](../04-build/19-target-apps.md) and [16](../04-build/16-agent-test-suite.md).

---

## 1. Why external platforms, and what each proves

The canonical three targets ([19 §1](../04-build/19-target-apps.md)) prove the pipeline works on a controlled fixture, a public site nobody built for us, and a CRUD surface with real destructive actions. External platforms extend that in three directions the canonical three don't cover well: **pre-existing, undisclosed bugs** (as opposed to bugs we inject on command), **a wider variety of UI/interaction patterns** to stress the perception layer and login detector, and **more raw material for cold-switch rehearsal** than three fixed URLs provide.

| `EXT-` | Platform | Type | Best purpose | Claim it earns |
|---|---|---|---|---|
| `EXT-01` | AcademyBugs | Practice site, 25 planted bugs | Bug-detection sanity check | *"It notices a real, undisclosed bug on a third-party site."* |
| `EXT-02` | Sweet Shop | E-commerce demo (bugs unconfirmed) | Price/assertion validation | *"It validates assertions, not just locators"* — **if** a defect is actually present; see §4.2 |
| `EXT-03` | Coffee Cart | Small cart/checkout SPA | Cart and checkout flow validation | *"It handles a hydration-heavy cart flow without hardcoded paths"* |
| `EXT-04` | Restful Booker | API-first playground | — | **Demoted; see §4.4.** No confirmed web UI to explore |
| `EXT-05` | The Internet (Heroku) | Web-element practice site | Interaction-pattern coverage | *"It detects common web patterns — auth, frames, alerts, drag-and-drop — without configuration"* |
| `EXT-06` | DemoQA | Widget/component practice site | UI-component coverage | *"It handles forms, frames, alerts, and widgets"* |
| `EXT-07` | Automation Exercise | Full e-commerce + API | End-to-end + API validation | *"It handles complete e-commerce flows with an API surface alongside them"* |
| `EXT-08` | ParaBank | Banking demo, SOAP + REST API | Multi-step transaction flows | *"It validates multi-step financial workflows, UI and API together"* |
| `EXT-09` | EvilTester Compendium | Collection of small apps/pages | Fast, targeted micro-tests | *"It runs fast, deterministic checks against a narrow, well-understood surface"* |
| `EXT-10` | OWASP Juice Shop | Deliberately vulnerable SPA | Large-surface generalisation stress | *"It holds up against a big, hydration-heavy, deliberately messy application"* — **not** a security-testing claim; see §4.10 |

Each platform earns its place by having exactly one property the canonical three lack. None earns a place by being redundant with Aperture, SauceDemo, or Conduit — if a platform doesn't add a *new* stress, it doesn't belong here.

---

## 2. Why these stay supplementary, not canonical

Three existing rules already answer "why not just make these T4, T5, …":

1. **[19 §1.1](../04-build/19-target-apps.md)'s roster rule** — nothing about a specific application appears in `packages/**`, and a unit test greps for target literals. Adding platforms is cheap; keeping the "zero target literals" guarantee true for thirteen targets instead of three is not free, and none of these ten need it to be useful.
2. **[16 §12](../04-build/16-agent-test-suite.md)'s harness discipline** — *"Asserting numbers against T2 and T3 … we assert shape there, never scores"*, and *"Seven cases we understand completely beat a thousand we do not, on an eight-hour clock."* The same argument applies with more force here: none of these ten are ours, several are unconfirmed (§3), and a golden case pinned to somebody else's HTML is a test that fails when they ship a release — which teaches the team to ignore it. **None of these platforms enter `fixtures/golden/` or the `EC-nn` gate.**
3. **[23 · Risk Register](../05-delivery/23-risk-register.md) RK-07 and the new RK-11** — demo state must never depend on something we don't control resetting on someone else's schedule. Restful Booker resetting its own data every ten minutes (§4.4) is exactly the failure mode RK-07 exists to keep off the critical path.

The honest positioning: canonical targets validate **correctness** (a specific score, a specific veto, a specific DOM contract). External platforms validate **generalisation** — did the agent produce a sane capability map, backlog, and report on something nobody wrote a fixture for. That is a real and useful signal, and it is a different signal than a golden case, which is why it gets a different, lower-stakes home.

---

## 3. How these characterisations were checked

Each URL below was fetched once (5 Sep 2026) and cross-checked against its own landing-page content — not against a full FORGE exploration pass. Two platforms failed to yield useful confirmation because their homepages render client-side and a static fetch sees only the shell (Coffee Cart, DemoQA); their entries below rely on widely-published descriptions instead and are marked accordingly. One platform's premise was wrong on inspection (Restful Booker, §4.4). One platform's "intentional bugs" claim could not be corroborated from the live site itself (Sweet Shop, §4.2).

**The rule going forward:** before any of these is used for a real Wave (§6), re-confirm with `forge doctor --target <id>` and one exploration pass. A characterisation that was true in September may not be true the day it's used — these are, by definition, sites we do not control.

---

## 4. Platform catalogue

### 4.1 AcademyBugs (`EXT-01`)

| | |
|---|---|
| **URL** | `https://academybugs.com/` |
| **Type** | Practice site, self-described as containing 25 planted bugs |
| **Login** | No |
| **E-commerce** | No — but see below |
| **CRUD** | No |
| **API** | No |
| **Intentional bugs** | **Confirmed.** The site's own UI tracks "You found 0 bugs out of 25" |
| **Disposable** | No |

**Correction from research.** The site includes a non-transactional order/booking modal that explicitly warns *"Clicking 'Submit Order' will not create a real order, this site is for education purposes only."* It looks like an e-commerce flow and is safe to explore, but nothing durable is ever written — closer to Aperture's read-only exploration posture than to a real checkout.

**What it proves:** the agent notices a real, undisclosed bug on a site nobody built for us — the sharpest available test of `EXT-01`'s claim, because unlike `M-nn` these bugs were never described to FORGE in FORGE's vocabulary.

**Target profile:**

```jsonc
// targets/academybugs.json
{
  "id": "academybugs",
  "name": "AcademyBugs",
  "url": "https://academybugs.com/",
  "credentials": null,
  "budget": { "maxCapabilities": 8, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Public practice site with 25 planted bugs. The order modal is non-transactional by the site's own design; treat as read-only regardless."
}
```

**Expected capability map:** ~6–10 capabilities, ~10–15 states. Not asserted as a score — see §9.

---

### 4.2 Sweet Shop (`EXT-02`)

| | |
|---|---|
| **URL** | `https://sweetshop.netlify.app/` |
| **Type** | E-commerce demo (product catalogue, basket) |
| **Login** | No |
| **E-commerce** | Yes — confirmed live: a product catalogue with pricing and "Add to Basket" |
| **CRUD** | No |
| **API** | No |
| **Intentional bugs** | **Unconfirmed** |
| **Disposable** | No |

**Correction from research.** The live site does not self-describe as intentionally broken — it presents as an ordinary 2018-vintage class project storefront, with no mention of planted pricing or discount defects anywhere in its own content. This is a meaningful downgrade from the original framing: a claim like *"it validates assertions, not just locators"* only holds if a defect is actually present, and that has not been established here the way it has for AcademyBugs.

**What it proves, conditionally:** if a pricing or discount inconsistency does exist, this is a clean test of whether the agent's generated assertions catch it rather than only its locators. **Confirm via one exploration pass before using this for Wave 2 (§6)** — do not assume the bug is there because the original research said so.

**Target profile:**

```jsonc
// targets/sweetshop.json
{
  "id": "sweetshop",
  "name": "Sweet Shop",
  "url": "https://sweetshop.netlify.app/",
  "credentials": null,
  "budget": { "maxCapabilities": 6, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "E-commerce demo. 'Intentional bugs' claim is unconfirmed from the live site — verify before relying on it for a bug-detection wave."
}
```

**Expected capability map:** ~5–8 capabilities, ~8–12 states.

---

### 4.3 Coffee Cart (`EXT-03`)

| | |
|---|---|
| **URL** | `https://coffee-cart.app/` |
| **Type** | Small cart/checkout single-page app |
| **Login** | No |
| **E-commerce** | Yes |
| **CRUD** | No |
| **API** | No |
| **Intentional bugs** | No |
| **Disposable** | No |

**Correction from research.** A static fetch of the homepage returned only a bare page title — the app is client-rendered, and its real content only exists after JavaScript runs. This is not a defect in the platform; it is exactly the class of target [08 §6](../02-architecture/08-perception-layer.md) and the Fork & Flame spec ([target-apps/fork-and-flame/README.md](fork-and-flame/README.md) §19) are built to argue for: perception must key off role, accessible name, and ancestor path, never raw markup, because a hydration-heavy SPA's DOM churns between loads in ways a canonical, server-rendered target like Aperture never does.

**What it proves:** the agent can build a capability map on a genuinely client-rendered app without any server-rendered fallback to lean on — a real-world SPA stress test the canonical roster doesn't otherwise provide (Conduit is server-rendered; see [19 §2.2](../04-build/19-target-apps.md)).

**Target profile:**

```jsonc
// targets/coffeecart.json
{
  "id": "coffeecart",
  "name": "Coffee Cart",
  "url": "https://coffee-cart.app/",
  "credentials": null,
  "budget": { "maxCapabilities": 5, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Client-rendered SPA — a static fetch sees no content. Exploration must run with JS enabled and should expect real hydration noise."
}
```

**Expected capability map:** ~4–6 capabilities, ~6–10 states.

---

### 4.4 Restful Booker — demoted (`EXT-04`)

| | |
|---|---|
| **URL** | `https://restful-booker.herokuapp.com/` |
| **Type** | **API playground, not a UI application** |
| **Login** | Token-based API auth (`POST /auth`), not a browser login form |
| **E-commerce** | No |
| **CRUD** | Yes — via the API |
| **API** | Yes — this *is* the product |
| **Intentional bugs** | Yes, by the maintainer's own description |
| **Disposable** | No |

**Correction from research — significant.** The original research conflated two different things. `restful-booker.herokuapp.com` is, in its own words, *"an API playground … for those wanting to learn more about API testing and tools"* — a landing page with Swagger-style docs, not a browsable booking UI. Two consequences:

1. **FORGE explores a rendered web page, not a bare API.** `apiHints[]` ([05 §2.4](../02-architecture/05-data-model.md)) can *observe* network traffic during a UI crawl, but there is no dedicated API-driving agent — the model never issues raw HTTP calls as its own capability ([01 §5.2](../01-foundation/01-vision-and-scope.md): *"unit / API / load testing"* is out of scope). A platform with no explorable UI is not a FORGE target; it's a fixture for a different kind of tool.
2. **The platform resets its own data every ten minutes.** Independent of the UI question, that is a hard determinism hazard: a session running anywhere near that long risks the fixture being wiped mid-run, which would look exactly like an `ENVIRONMENT` classification for the wrong reason.

**Recommendation:** either drop this entry, or substitute a *different, UI-bearing* booking demo before using it for the "API + UI" claim — do not run `restful-booker.herokuapp.com` expecting a crawlable web application. This entry is kept in the catalogue only as a documented correction, not as a usable target.

**What it would have proven, had the UI existed:** API-layer and UI-layer validation running in the same lap. **ParaBank (§4.8) and Automation Exercise (§4.7) already deliver this claim with a confirmed UI**, and should be preferred over this entry.

---

### 4.5 The Internet (Heroku) (`EXT-05`)

| | |
|---|---|
| **URL** | `https://the-internet.herokuapp.com/` |
| **Type** | Web-element and interaction-pattern practice site |
| **Login** | Yes — basic auth, digest auth, and a form-login page, all as separate practice pages |
| **E-commerce** | No |
| **CRUD** | No |
| **API** | No |
| **Intentional bugs** | No |
| **Disposable** | No |

**Confirmed live.** Categories include authentication (basic/digest/form/forgot-password), interactions (checkboxes, dropdowns, hovers, key presses, drag-and-drop), dynamic content (loading, disappearing/shifting elements), navigation (frames, nested frames, multiple windows), file upload/download, and JS challenges (alerts, shadow DOM).

**What it proves:** the login detector ([09 §2.1](../03-algorithms/09-exploration-and-prioritisation.md)) and the perception layer meet several *structurally different* auth and interaction patterns in one place — more variety per minute than any single canonical target offers, because this site's entire purpose is enumerating patterns rather than modelling one coherent product.

**Target profile:**

```jsonc
// targets/theinternet.json
{
  "id": "theinternet",
  "name": "The Internet",
  "url": "https://the-internet.herokuapp.com/",
  "credentials": { "usernameEnv": "TI_USER", "passwordEnv": "TI_PASS" },
  "budget": { "maxCapabilities": 10, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Web-element practice site — many small, independent pages rather than one coherent flow. Read-only: no destructive actions."
}
```

**Expected capability map:** ~8–12 capabilities, ~15–25 states — likely to cluster oddly, since [09 §5](../03-algorithms/09-exploration-and-prioritisation.md)'s clustering algorithm assumes a product with shared navigation, and this site is closer to an index of unrelated demos. That mismatch is itself informative: it is a stress test of the nav-stripping pass on a site where "global navigation" barely exists.

---

### 4.6 DemoQA (`EXT-06`)

| | |
|---|---|
| **URL** | `https://demoqa.com/` |
| **Type** | Widget and UI-component practice site |
| **Login** | No |
| **E-commerce** | No |
| **CRUD** | No |
| **API** | No |
| **Intentional bugs** | No |
| **Disposable** | No |

**Correction from research.** Like Coffee Cart, a static fetch of the homepage returned only a placeholder shell — this is a client-rendered React application, and its category cards (commonly: Elements, Forms, Alerts/Frames/Windows, Widgets, Interactions, Book Store Application) were not independently confirmed by this pass. They are widely and consistently documented publicly, so the shape below is kept, but flagged as **unconfirmed by fetch**.

**What it proves:** breadth of UI-component coverage — forms, alerts, frames, drag-and-drop widgets, date pickers — in one site, plus a second confirmed instance of the hydration-noise stress that Coffee Cart provides.

**Target profile:**

```jsonc
// targets/demoqa.json
{
  "id": "demoqa",
  "name": "DemoQA",
  "url": "https://demoqa.com/",
  "credentials": null,
  "budget": { "maxCapabilities": 10, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Client-rendered widget practice site — category shape is publicly documented but not independently confirmed by fetch. Read-only: no form submission."
}
```

**Expected capability map:** ~8–12 capabilities, ~15–20 states.

---

### 4.7 Automation Exercise (`EXT-07`)

| | |
|---|---|
| **URL** | `https://www.automationexercise.com/` |
| **Type** | Full e-commerce demo with a published API |
| **Login** | Yes |
| **E-commerce** | Yes |
| **CRUD** | Yes (account, orders) |
| **API** | **Confirmed** — the site's own navigation includes "API Testing" and an "APIs list for practice" |
| **Intentional bugs** | No |
| **Disposable** | No |

**Confirmed live.** Self-described as *"a Full-Fledged practice website for Automation Engineers"* covering product browsing, cart, checkout, login/signup, and API endpoints "either they are at beginner or advance level."

**What it proves:** a complete e-commerce flow — the same shape Aperture and Fork & Flame model deliberately — but on a target with a genuinely larger surface (categories, brands) and a confirmed API alongside it.

**Target profile:**

```jsonc
// targets/automationexercise.json
{
  "id": "automationexercise",
  "name": "Automation Exercise",
  "url": "https://www.automationexercise.com/",
  "credentials": { "usernameEnv": "AE_USER", "passwordEnv": "AE_PASS" },
  "budget": { "maxCapabilities": 10, "maxDurationMs": 600000, "maxUsd": 1.5 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Full e-commerce with a published API. Read-only: no order placement or account creation."
}
```

**Expected capability map:** ~8–12 capabilities, ~15–25 states.

---

### 4.8 ParaBank (`EXT-08`)

| | |
|---|---|
| **URL** | `https://parabank.parasoft.com/parabank/index.htm` |
| **Type** | Banking demo application |
| **Login** | Yes — customer login plus registration |
| **E-commerce** | No |
| **CRUD** | Yes — transfers, bill pay |
| **API** | **Confirmed, and stronger than the original research stated** — the site references both a SOAP web service and a REST API |
| **Intentional bugs** | No |
| **Disposable** | No |

**Correction from research.** The original catalogue marked this platform's API column `No`. The live site explicitly advertises SOAP (ParaBank) and REST (bank) web-service endpoints alongside the UI, which makes ParaBank — not Restful Booker — the strongest confirmed *"API + UI combination"* candidate in this catalogue.

**What it proves:** multi-step financial workflows (login → transfer → bill pay → account history) with genuine UI and API surfaces both present and confirmed.

**Target profile:**

```jsonc
// targets/parabank.json
{
  "id": "parabank",
  "name": "ParaBank",
  "url": "https://parabank.parasoft.com/parabank/index.htm",
  "credentials": { "usernameEnv": "PB_USER", "passwordEnv": "PB_PASS" },
  "budget": { "maxCapabilities": 8, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "Banking demo with SOAP + REST APIs alongside the UI. Read-only: no transfers or bill pay executed."
}
```

**Expected capability map:** ~6–10 capabilities, ~10–15 states.

---

### 4.9 EvilTester Compendium (`EXT-09`)

| | |
|---|---|
| **URL** | `https://testpages.eviltester.com/` |
| **Type** | Collection of small, independent practice pages and apps |
| **Login** | Mixed — some sub-apps have their own auth |
| **E-commerce** | No |
| **CRUD** | Yes — some sub-apps (e.g. a contact-list style app) |
| **API** | No |
| **Intentional bugs** | Confirmed for at least one sub-app |
| **Disposable** | No |

**Correction from research.** The confirmed bug-planted sub-application is **"Buggy Games"**, per the site's own reference section — the original catalogue's "Buggy Apps" name was not corroborated and should not be cited as a separate entity. The site organises itself into three categories: **Pages** (focused single-concept examples), **Apps** (small functional applications), and **Challenges** (deliberately hard-to-automate exercises) — created by Alan Richardson.

**What it proves:** fast, narrow, deterministic checks against a well-understood, small surface — useful for a quick sanity pass rather than a full capability-map exercise.

**Target profile:**

```jsonc
// targets/eviltester.json
{
  "id": "eviltester",
  "name": "EvilTester Compendium",
  "url": "https://testpages.eviltester.com/",
  "credentials": null,
  "budget": { "maxCapabilities": 10, "maxDurationMs": 600000, "maxUsd": 1.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": false,
  "notes": "A collection of independent pages/apps/challenges, not one product. Bugs are confirmed only in the 'Buggy Games' sub-app. Read-only: no destructive actions."
}
```

**Expected capability map:** ~10–15 capabilities (many small, independent clusters), ~20–30 states — expect the clustering algorithm to produce many single-page capabilities here, which is the correct behaviour on a site that genuinely is many unrelated apps.

---

### 4.10 OWASP Juice Shop — generalisation stress, not security mode (`EXT-10`)

| | |
|---|---|
| **URL** | Project page `https://owasp.org/www-project-juice-shop/`; **run locally via Docker** (`bkimminich/juice-shop`), never against a shared public instance |
| **Type** | Deliberately vulnerable single-page application (Angular) |
| **Login** | Yes |
| **E-commerce** | Yes |
| **CRUD** | Yes |
| **API** | Yes |
| **Intentional bugs** | Yes — OWASP Top 10 vulnerabilities, by design |
| **Disposable** | Yes, for a local deployment |

**Scope correction — this is the important one.** The original draft proposed an optional "security testing mode" producing a `SECURITY_FINDING` category. **That is out of scope and should not be built:**

- The brief never mentions security testing, and [00-problem-alignment.md §3](../01-foundation/00-problem-alignment.md)'s rule is explicit: *"if a feature does not appear in the coverage table in §3 or the rubric table in §4, it does not get built."* A security-classification feature earns zero rubric weight.
- `DiagnosisKind` is a closed six-value enum (`LOCATOR_BREAK`, `CONTENT_DRIFT`, `PRODUCT_BUG`, `FLAKY`, `ENVIRONMENT`, `UNKNOWN`), and the schema freezes at the end of `Ph1` ([05 §2.9](../02-architecture/05-data-model.md), [00-work-plan.md §5](../00-work-plan.md)). Adding a seventh value is exactly the kind of edit the freeze exists to prevent — it "invalidates work in three places at once" ([15 §3.1](../04-build/15-repo-and-conventions.md)).
- This is the same shape of decision as [ADR-013](../decisions/ADR-013-design-intelligence-deferred.md): a real, interesting capability, deliberately deferred because it is not what is being graded.

**The good news is that no extension is actually needed.** Many of Juice Shop's vulnerabilities manifest, from the outside, as ordinary broken behaviour the existing six-cause taxonomy already handles correctly: a price that can be manipulated client-side surfaces as a wrong `#total-amount` string — the same shape as Aperture's `M-03`, caught by veto `V3`. A broken access-control check that lets a request through when it shouldn't produces a wrong assertion result — `PRODUCT_BUG` via `V1`, no new category required. **Juice Shop's real value here is as a large, messy, hydration-heavy application for generalisation stress** — does the capability map stay sane, does the deny-list correctly decline the delete/admin surfaces, does the report stay honest about what wasn't reached — not as a demonstration of a security feature FORGE does not have.

**Target profile:**

```jsonc
// targets/juiceshop.json
{
  "id": "juiceshop",
  "name": "OWASP Juice Shop",
  "url": "http://localhost:3000/",
  "credentials": { "usernameEnv": "JS_USER", "passwordEnv": "JS_PASS" },
  "budget": { "maxCapabilities": 12, "maxDurationMs": 600000, "maxUsd": 2.0 },
  "politeness": { "minDelayMs": 500, "maxConcurrency": 1 },
  "disposable": true,
  "notes": "Deliberately vulnerable SPA, local Docker only. Used for generalisation stress. Findings are reported through the existing six-cause taxonomy — no SECURITY_FINDING category exists or should be built."
}
```

**Expected capability map:** ~10–15 capabilities, ~20–30 states.

---

## 5. Platform-to-claim mapping

| Claim | Canonical target | External platforms that reinforce it |
|---|---|---|
| *"We can prove refusal-to-heal, because we can inject the defect."* | Aperture (T1) | None — this claim requires a toggleable defect, which no external platform has. Nothing here substitutes for `M-nn`. |
| *"It works on an application we did not build and cannot modify."* | SauceDemo (T2) | `EXT-01`, `EXT-02` (conditionally), `EXT-03`, `EXT-05`, `EXT-06`, `EXT-07`, `EXT-08`, `EXT-09` |
| *"It handles create/edit/delete surfaces — and declines to press the dangerous ones."* | Conduit (T3) | `EXT-07`, `EXT-08`, `EXT-09` (the contact-list-style sub-app), `EXT-10` |
| *"It notices a real, undisclosed bug on a third-party site."* | — | `EXT-01` (confirmed), `EXT-02` (unconfirmed), `EXT-09`'s Buggy Games |
| *"It integrates API-layer and UI-layer validation."* | — | `EXT-08`, `EXT-07`. **Not** `EXT-04` — see §4.4 |
| *"It detects common web patterns without configuration."* | — | `EXT-05`, `EXT-06` |
| *"It runs fast, deterministic micro-tests."* | — | `EXT-09` |
| *"It holds up on a large, hydration-heavy application."* | — | `EXT-10` — generalisation only, never a security claim (§4.10) |

---

## 6. The validation waves

Deliberately **not** called "phases" — `Ph0`…`Ph6` already names the build phases ([20-execution-plan.md](../05-delivery/20-execution-plan.md)) and "tier" already names the eval harness's four levels ([16 §2](../04-build/16-agent-test-suite.md)). Reusing either word here would make a sentence like *"which phase does this run in?"* ambiguous between two unrelated schedules. These are **waves**: an informal, non-gating validation sequence a developer can run at their own pace, never a CI job and never a phase-exit gate.

### Wave 1 — core validation (canonical targets, for reference)

| Target | Purpose | Acceptance criteria |
|---|---|---|
| Aperture | Controlled defect injection, classification, healing refusal | [19 §2, §3, §4, §5, §9 (T1)](../04-build/19-target-apps.md) |
| SauceDemo | Third-party DOM validation, login detection | [19 §6.2, §9 (T2)](../04-build/19-target-apps.md) |
| Conduit | CRUD and safety testing, destructive-action detection | [19 §6.3, §9 (T3)](../04-build/19-target-apps.md) |

Pass criteria: unchanged from [19 §9](../04-build/19-target-apps.md). This wave is the floor; nothing below it is required for the build to be considered done.

### Wave 2 — bug-detection sanity checks

| Target | Purpose | Expected outcome |
|---|---|---|
| `EXT-01` AcademyBugs | Planted-bug detection | Agent finds and correctly classifies at least a handful of the 25 bugs as `PRODUCT_BUG` or `CONTENT_DRIFT`, never silently healed |
| `EXT-02` Sweet Shop | Price/assertion validation | **Confirm a defect actually exists (§4.2) before treating a null result as a miss** |
| `EXT-09` Buggy Games | Quick regression check | Agent runs a targeted check in well under the Wave 1 lap budget |

Pass criteria: a bug encountered on any of these is classified through the existing six-cause taxonomy — never healed if it manifests as a failed assertion (`V1`).

### Wave 3 — pattern coverage

| Target | Purpose | Expected outcome |
|---|---|---|
| `EXT-05` The Internet | Element/interaction patterns | Agent's login detector and perception layer handle basic/digest/form auth and common interaction widgets |
| `EXT-06` DemoQA | UI-component coverage | Agent handles forms, widgets, alerts, frames despite hydration noise |
| `EXT-03` Coffee Cart | Cart validation on a real SPA | Agent produces a sane map with zero server-rendered fallback to lean on |

Pass criteria: capability maps with ≥ 4 capabilities per target; no crawl failure attributable to hydration noise alone.

### Wave 4 — API + UI and multi-step workflows

| Target | Purpose | Expected outcome |
|---|---|---|
| `EXT-08` ParaBank | Banking, multi-step transactions | Agent handles login → transfer/bill-pay flows |
| `EXT-07` Automation Exercise | Full e-commerce + API | Agent handles complete e-commerce flow, notes API surface via `apiHints[]` |

Pass criteria: reports contain the **five** contents `FR-801` actually mandates — `scenariosCovered`, `outcomes`, `healerActions`, `coverageGapsRemaining`, `untestedFlowRisk` ([14 §1](../03-algorithms/14-quality-report-and-score.md)) — not the capability-map/backlog/lap artefacts a pipeline produces along the way, which are inputs to the report, not the report's mandated contents.

### Wave 5 — generalisation stress (optional)

| Target | Purpose | Expected outcome |
|---|---|---|
| `EXT-10` OWASP Juice Shop, local | Large, messy SPA | Agent's capability map stays legible, the deny-list correctly declines admin/delete surfaces, the report is honest about `haltReason` on a surface this large |

Pass criteria: no new `Diagnosis.kind` is introduced; findings route through the existing six causes (§4.10).

### Wave 6 — cold-switch rehearsal

Directly reuses [19 §7](../04-build/19-target-apps.md)'s `R-3` procedure, substituting any platform from this catalogue (or a genuinely new one) for the day-of URL.

| Target | Purpose | Expected outcome |
|---|---|---|
| Any platform above, or one not in this catalogue | Generalisation to an unseen application | Capability map, ranked backlog, ≥ 1 banked lap, and a report — zero code changes, zero configuration beyond a profile |

Pass criteria: identical to `R-3`'s own — see [19 §7](../04-build/19-target-apps.md) for the failure-mode table. Not one outcome here is `ERROR`.

---

## 7. Target-profile format

Identical to the canonical format ([19 §6.1](../04-build/19-target-apps.md)) — no selectors, route names, or expected text, ever.

```jsonc
// targets/<platform>.json — tracked; secrets live in the environment
{
  "id": "<platform-id>",
  "name": "<Platform Name>",
  "url": "<base URL>",
  "credentials": { "usernameEnv": "<ENV_VAR>", "passwordEnv": "<ENV_VAR>" } | null,
  "budget": { "maxCapabilities": <number>, "maxDurationMs": <number>, "maxUsd": <number> },
  "politeness": { "minDelayMs": <number>, "maxConcurrency": <number> },
  "disposable": <boolean>,
  "notes": "<brief description, including any known caveat from §4>"
}
```

**On the two id systems.** The `EXT-nn` label (`EXT-01`…`EXT-10`) is how this document and anything citing it — a risk-register row, a work-plan item — points at one catalogue entry. The JSON `"id"` field (`"academybugs"`, `"parabank"`, …) is the unrelated, lowercase slug the `targets/` loader and `forge doctor --target <id>` actually use. Do not conflate the two: `EXT-08` is a citation; `"parabank"` is a filename stem.

**Constraints**, unchanged from the canonical roster:

- No selectors, route names, or expected text in any profile.
- Credentials reference environment variables only, never literals.
- `disposable: false` for every public platform in this catalogue except a genuinely local deployment (only `EXT-10` today).

---

## 8. Safety and politeness

Unchanged from [19 §8](../04-build/19-target-apps.md) — reproduced here because these rules matter more, not less, on platforms we did not build and have not stress-tested ourselves.

| Rule | Mechanism |
|---|---|
| Never submit a destructive action | The verb deny-list blocks submission; the affordance is recorded, not dropped (`FR-106`) |
| Stay on the origin | Off-origin navigation returns `OFF_ORIGIN`, is recorded, and the crawl returns (`FR-109`) |
| One tab, throttled | `maxConcurrency: 1`, `minDelayMs` from the profile — we are a visitor, not a load test |
| Back off, don't retry harder | `429`/`503` widens the delay and consumes frontier budget rather than hammering (`Q-3`) |
| Nothing durable is written | No account creation, no orders placed, on any platform in this catalogue |
| Credentials never land on disk | In memory and in `storageState` only; an emitted suite reads `process.env` (`FR-006`, `I-16`) |

---

## 9. Acceptance criteria for external platforms

External platforms have no golden assertion values. They assert **shape and process**, never a specific number — the same distinction [19 §6.2](../04-build/19-target-apps.md) already draws for SauceDemo, extended to the rest of this catalogue.

| Criterion | External platforms | Canonical targets |
|---|---|---|
| Capability map produced | Yes — ≥ 4 capabilities | Yes — a specific shape ([19 §2.4](../04-build/19-target-apps.md), §6.2, §6.3) |
| Ranked backlog produced | Yes — a total ordering | Yes — a specific ranking |
| Banked laps produced | Yes — ≥ 1 lap | Yes — specific laps |
| Test suites compiled | Yes — at least one | Yes — specific suites |
| Report's five mandated contents (`FR-801`) | Yes — all five populated | Yes — all five, plus specific values |
| Golden scores | **No** — assert shape only | Yes — e.g. `0.891` for Aperture's `EC-05` heal |
| Determinism (`NFR-1`) | **No** — public sites can change under us | Yes — Aperture is deterministic by construction |

**Key principle, unchanged from the canonical roster's own framing:** external platforms validate generalisation; canonical targets validate correctness. Neither substitutes for the other.

---

## 10. Known limitations

| Limitation | Impact | Stated answer |
|---|---|---|
| External platforms can change or go down without warning | A golden assertion against them would flake | We assert shape, never numbers (§9); none enter `fixtures/golden/` |
| Several characterisations here are unconfirmed by a live fetch (Coffee Cart, DemoQA) or contradicted by one (Restful Booker) | A row could be stale or simply wrong the day it's used | §3's rule: `forge doctor` plus one exploration pass before relying on any row |
| "Intentional bugs" is confirmed for some platforms and not others | Wave 2 could silently report a false negative | Sweet Shop is explicitly flagged unconfirmed (§4.2); do not treat a null result there as a miss |
| No platform here offers a toggleable, reversible defect | None of these can substitute for `M-nn` in the refusal-to-heal demo beat | Aperture remains the only source of that claim ([19 §2.1](../04-build/19-target-apps.md)) |
| Rate limits, logins that expire, and data resets are platform-specific and undocumented in most cases | Restful Booker's 10-minute reset was caught only by direct research; others may have similar undisclosed limits | Politeness controls plus short budgets throughout; treat every platform as potentially unstable until proven otherwise |

---

## 11. Related documents

- Canonical target roster, the one this supplements → [19 · Target Applications](../04-build/19-target-apps.md)
- Aperture's DOM contract, never touched by this document → [19 §3](../04-build/19-target-apps.md)
- The injectable-defect registry, never touched by this document → [19 §5](../04-build/19-target-apps.md)
- The cold-switch procedure Wave 6 reuses → [19 §7](../04-build/19-target-apps.md)
- The Explorer algorithm every wave exercises → [09 · Exploration & Prioritisation](../03-algorithms/09-exploration-and-prioritisation.md)
- The deny-list constant that keeps every wave safe → [08 · Perception Layer §4.1](../02-architecture/08-perception-layer.md)
- Why golden cases never pin a score to somebody else's HTML → [16 · Agent Test Suite §12](../04-build/16-agent-test-suite.md)
- Why design/security-adjacent features get deferred rather than deleted → [ADR-013](../decisions/ADR-013-design-intelligence-deferred.md)
- The report's actual five mandated contents, cited in §6 Wave 4 → [14 · Quality Report & Score §1](../03-algorithms/14-quality-report-and-score.md)
- A sibling supplementary target, same directory, same non-canonical status → [target-apps/fork-and-flame/README.md](fork-and-flame/README.md)

---

## 12. Appendix — quick-reference table

| `EXT-` | Platform | URL | Login | E-com | CRUD | API | Bugs | Disposable | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 01 | AcademyBugs | academybugs.com | ❌ | mock only | ❌ | ❌ | ✅ confirmed | ❌ | High |
| 02 | Sweet Shop | sweetshop.netlify.app | ❌ | ✅ | ❌ | ❌ | ❓ unconfirmed | ❌ | Medium |
| 03 | Coffee Cart | coffee-cart.app | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Medium (SPA, unconfirmed by fetch) |
| 04 | Restful Booker | restful-booker.herokuapp.com | API only | ❌ | ✅ (API) | ✅ | ✅ | ❌ | **Low — no confirmed UI; see §4.4** |
| 05 | The Internet | the-internet.herokuapp.com | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | High |
| 06 | DemoQA | demoqa.com | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Medium (SPA, unconfirmed by fetch) |
| 07 | Automation Exercise | automationexercise.com | ✅ | ✅ | ✅ | ✅ confirmed | ❌ | ❌ | High |
| 08 | ParaBank | parabank.parasoft.com | ✅ | ❌ | ✅ | ✅ confirmed (SOAP+REST) | ❌ | ❌ | High |
| 09 | EvilTester | testpages.eviltester.com | Mixed | ❌ | ✅ | ❌ | ✅ ("Buggy Games") | ❌ | High |
| 10 | Juice Shop | localhost:3000 (local Docker) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | High — but generalisation only, never a security claim |

---

**Document status:** Supplementary research, cross-linked into the canonical doc set. Not reviewed at any checkpoint (`C1`…`C5`) and not required for any exit gate.
**Next action, if pursued:** create `targets/*.json` for Wave 2–4 platforms; re-confirm every row against a live exploration pass before first use, per §3.
