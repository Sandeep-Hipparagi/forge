# ADR-007 · Build our own deterministic SUT rather than test a public sandbox

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P5 (SUT owner) · P2, P4 consulted |
| **Requirements** | FR-201, NFR-1, NFR-2, NFR-5, NFR-9 |
| **Governs** | [19](../04-build/19-target-apps.md) — the target roster |
| **Related risks** | [RK-01](../05-delivery/23-risk-register.md), RK-06 |

---

## 1. Context

FORGE's demo has a specific shape: run a suite green, **break the product live**, and show the system deciding whether to heal or refuse. That structure imposes requirements on the application under test that most applications cannot meet — the defect has to be injectable on stage, reversible in one command, and describable without ever opening an editor.

The SUT is therefore not a placeholder. It is demo infrastructure, and it is the only component that has to be correct *and correctable in front of an audience*.

---

## 2. The two options

### Option A — A public sandbox or a real staging app

SauceDemo, the-internet.herokuapp.com, or a real product's staging environment.

### Option B — Aperture Checkout, our own app *(chosen)*

Express 4 + [Eta](https://eta.js.org) templates, one hand-written CSS file, ~40 lines of vanilla JS. No bundler, no client framework, three dependencies. Seeded fixed state, frozen clock, and a `/__forge/*` mutation control plane bound to loopback.

### Comparison

| Criterion | A · public sandbox | B · our own SUT |
|---|---|---|
| Inject a controlled, reversible defect at run time | **Impossible** | The mutation registry — the decisive row |
| Available on demo day | Someone else's uptime | Localhost |
| DOM pinned across the build | No — it can change under us | Byte-for-byte, written down as a DOM contract |
| Clock and currency determinism | No | Frozen at `2026-01-01T00:00:00Z`, INR in paise |
| Reset in under 20 s (NFR-9) | No | `forge reset` |
| Screenshot determinism (NFR-1) | Hopeless | Achievable with the §3.1 controls |
| Realism | Higher | Lower |
| Credibility objection | None | "You tested your own app — of course it passes" |
| Build cost | 0 | ≈1.5 days (P5, off the critical path) |

Row one ends the argument on its own. Without run-time defect injection there is no Scenario B, and without Scenario B there is no product thesis to demonstrate — only a self-healer, which is the thing we are arguing against.

---

## 3. Decision

**Option B**, with two sub-decisions that are part of the same choice.

### 3.1 Server-rendered templates, not a React SPA

This is the part people push back on.

| | Server-rendered (chosen) | React SPA |
|---|---|---|
| DOM determinism | Identical bytes every render | Hydration attributes, key churn, effect ordering |
| Startup | ~120 ms, no build step | Build + dev-server warmup inside the demo path |
| Applying a mutation | One template-context transform, server-side | State plumbing through components |
| Framework noise in fingerprints | None | `data-reactroot`, minified class names |
| Realism | Less | More |

We are trading realism for determinism, and it is the right trade because **the SUT is not the product**. A judge never evaluates the checkout app; they evaluate whether FORGE's verdict about it was correct. Every millisecond of hydration nondeterminism is risk purchased for nothing.

### 3.2 Mutations are data, and the SUT never learns what FORGE expects

The mutation registry is what makes *"let me break it live"* controlled rather than a stunt:

- A mutation is a JSON entry, never a source edit. `git status` on the SUT stays clean through the whole demo — a claim we can invite a judge to verify.
- Applied at render time through a transform over the template context. No restart, no rebuild.
- Every toggle appends to `state/mutations.log`. **The demo itself is audited.**
- Mutations are expressed in the SUT's own vocabulary (`cta.id`, `total.amount`), never in FORGE's — no `EC-02`, no locator strings. The build-enforced `sut-is-isolated` rule keeps this true ([19 §5.1](../04-build/19-target-apps.md)).

That last point is the whole answer to the credibility objection, and it is an architectural guarantee rather than a promise: a mutation renames a DOM id and has no idea a test ever referenced it.

---

## 4. Consequences

**What we accept**

- We own a second application's correctness for the duration of the build.
- The demo runs against a page far simpler than a real product's.
- A defect-injection endpoint exists in the repository — genuinely dangerous if it ever escaped a laptop.

**What it buys**

- Scenario A and Scenario B both exist, on demand, reversibly.
- EC-01's byte-identical screenshots across two consecutive runs (FR-201) are achievable at all.
- `forge reset` returns a pristine state in under 20 s, so a failed beat can be re-run live (RK-06's contingency).

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| Screenshot bytes drift across machines or browser revisions | RK-01 · 6 | Pinned Chromium in the CI cache key, self-hosted woff2, `scrollbar-gutter: stable`, animations forced off, frozen clock |
| Chromium crashes mid-run on stage | RK-06 · 2 | Run marked `ERROR`, context recycled, `forge reset` under 20 s |
| The control plane is reachable from the network | not registered | Two independent gates — `SUT_CONTROL_ENABLED === "true"` **and** a loopback remote address — failing closed with a `404` rather than a `403`, so it does not advertise its own existence |
| A judge reads the purpose-built SUT as staging | not registered | §3.2, plus the offer to point FORGE at any localhost app |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | Judges accept a purpose-built SUT once isolation is explained | The strongest technical story loses to a fairness objection we could have pre-empted | Mitigated by §3.2 and by offering "point it at anything on localhost". **If that offer is accepted live, planning runs without a design contract** — and the contract-less path is not currently specified ([ADR-003 §7](ADR-003-design-contract-source.md)) |
| A2 | Results on a server-rendered DOM transfer to real React applications | Partly false, and in an under-discussed direction: React apps often have **unstable class names and missing accessible names**, so `role_name` is *less* available and `dom_relative`/`geometry` become load-bearing. Real apps would heal **less** confidently, not more | Honest framing beats a caveat: our ladder's top rung is available on our SUT by construction. Say that rather than implying generality |
| A3 | The mutation catalogue covers the interesting failure space | Seven eval cases is seven shapes of failure. Unknown unknowns remain, and a demo tuned to its own catalogue can look more general than it is | Any live request for a defect we cannot express as a mutation. Worth rehearsing at least one improvised mutation before D0 |
| A4 | Loopback + env flag is sufficient protection | Sufficient for a laptop; adjacent to remote code execution if ever deployed | Fails closed on both conditions. It should never ship in a hosted build, and nothing currently prevents that at build time |
| A5 | Determinism controls (frozen clock, fonts, animations off) are complete | One missing control turns EC-01 into a coin flip and buries DC-05 in false findings | RK-01's early warning: DC-05 firing on an unmutated SUT. The full precondition list is [09 §4](../deferred/design-intelligence.md) |
| A6 | Three dependencies stay three | Every addition to the SUT is a new source of nondeterminism in the component least able to afford it | Dependency count is a reviewable number; treat an increase as requiring a reason |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| We need to claim generality beyond our own app | Add a "bring your own URL" mode: functional flow only, DC-04…DC-10 disabled, DC-01…DC-03 against a first-run baseline. Ship it as a **stated limitation**, not as parity |
| The SPA-realism objection blocks a real customer evaluation | Add a **second** SUT variant (React) behind the same DOM contract and measure how the ladder degrades. Do not replace the Eta SUT — it is the determinism baseline everything else is compared against |
| The mutation-registry isolation is ever violated (the orchestrator reads SUT state) | Treat as a P0 bug, not a design trade-off. The honesty claim in §3.2 collapses entirely the moment FORGE can see the mutation list |
| Someone proposes deploying the SUT anywhere non-local | The control plane must be compiled out, not merely disabled by an env var |
| DC-05 fires on an unmutated SUT | A5 has failed. Fix determinism controls; raise the tolerance to 4 px and say so on stage (RK-01 contingency) |

---

## 8. Related

- [ADR-003 · Design contract source](ADR-003-design-contract-source.md) — the contract is authored from this app's DOM contract
- [19 · Target Applications](../04-build/19-target-apps.md) — the roster, the DOM contract, the defect registry, the control guard
- [09 §4](../deferred/design-intelligence.md) — the determinism preconditions this app must satisfy
