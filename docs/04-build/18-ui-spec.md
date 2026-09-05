# 18 · UI Spec

> **Rewrite of the pre-brief `12-ui-spec`.** That document designed a dark mission-control console for a demo about healing one broken button. The pipeline is now URL → explore → plan → critique → generate → run → triage → decide → report, the brief scores *"how clearly the agent's decisions are presented"* at 15%, and the visual language has changed with it.
> **The dashboard is the argument.** FORGE's thesis — *did the test break, or did the product break?* — is invisible in a terminal. Every screen exists to make one reasoning step legible to someone who has never seen the product and is standing eight feet from a projector.
> **This document owns:** the design tokens, the five screens, the component inventory, the live-update contract, and the UX checklist we hold ourselves to.
> **The test for every panel:** does it help a judge answer *"why did it decide that?"* faster? If not, it does not ship.

---

## 1. Six principles

1. **Show the reasoning, not the result.** A green tick proves nothing. `sem 1.00 · role 1.00 · text 1.00 · dom 0.95 · geo 0.98 · hist 0.00 → 0.891` proves something.
2. **Evidence is one click away, always.** Every claim carries a chip; every chip opens the artefact behind it. A verdict with fewer than three cited evidence items is a bug in FORGE, not a finding about the application (`S-5`).
3. **One grammar for every verdict.** `VERIFIED`, `DEFECT_FOUND`, `ESCALATED` and `ERROR` render through the *same* component in the *same* position. The audience learns the shape during the heal, so when the identical shape fills with a refusal, the contrast lands with no explanation. **This is the highest-leverage decision in the spec.**
4. **Refusal is a success state.** Red is for `ERROR` only — for *us* being broken. A `PRODUCT_BUG` verdict is styled as a finding, because finding one is the point.
5. **Never render a hole.** Loading, empty, degraded and error states are specified for every panel, because the one that appears on stage will be the one nobody designed.
6. **Legible at eight feet, honest at one.** Projector-first sizing, and every number on screen is a number a judge can recompute from the report.

---

## 2. The design language

### 2.1 The reversal, and why

The pre-brief spec was dark-only, on the argument that *"a light-theme flash on stage looks like a crash."* This edition is light. Three reasons, in order of weight:

1. **Projectors.** Venue projectors lose shadow detail and lift blacks. A dark UI at 8 feet turns into grey mush with glowing accents; a light UI stays legible because the contrast that matters is text-on-white.
2. **The report is a document.** `report.html` must print cleanly and paste into a pull request (`FR-805`). One visual system for the dashboard and the report means the artefact a team keeps looks like the tool that made it.
3. **The content is dense and textual** — plans, gaps, diffs, signal tables. Light backgrounds carry small text and long tables better than dark ones do, and this UI is mostly tables.

Restraint is the aesthetic: white surfaces, one accent, hairline separators, generous whitespace, no gradients, almost no shadow. The interface should look like it has nothing to hide, because its entire job is to show you the arithmetic.

### 2.2 Tokens

```css
:root {
  /* surface */
  --bg:        #ffffff;
  --surface:   #ffffff;
  --surface-2: #f8f9fa;      /* inset panels, table headers, code blocks */
  --line:      #e0e3e7;      /* hairlines do the work shadows used to */
  --line-2:    #c8ccd1;

  /* text */
  --text:      #202124;
  --text-2:    #5f6368;
  --text-3:    #80868b;

  /* meaning — see §2.3, this is a law, not a palette */
  --accent:    #1a73e8;      /* FORGE is acting */
  --verified:  #1e8e3e;      /* proven safe */
  --review:    #e37400;      /* needs a human */
  --defect:    #6b3fc4;      /* the product is broken — a finding, not an error */
  --error:     #d93025;      /* the harness broke. RESERVED. */

  /* tints, for fills behind the above */
  --accent-bg:   #e8f0fe;  --verified-bg: #e6f4ea;
  --review-bg:   #fef7e0;  --defect-bg:   #f0eafb;  --error-bg: #fce8e6;

  /* form */
  --radius:    8px;
  --radius-lg: 12px;
  --shadow-1:  0 1px 2px rgb(60 64 67 / .16);        /* the only shadow we use */
  --grid:      4px;                                   /* every spacing is a multiple */

  /* type — self-hosted, never fetched at runtime */
  --font: "Google Sans Text", Roboto, ui-sans-serif, system-ui, "Segoe UI", sans-serif;
  --mono: "Roboto Mono", ui-monospace, SFMono-Regular, "JetBrains Mono", monospace;
}
```

| Role | Size / weight | Used for |
|---|---|---|
| Display | 40 / 400 | The Robustness Score, and nothing else |
| Headline | 28 / 400 | Verdict headlines, screen titles |
| Title | 20 / 500 | Panel headers |
| Body | 15 / 400 | Everything |
| Label | 13 / 500, `.5px` tracking | Chips, table headers, metadata |
| Mono | 14 / 400, tabular numerals | Locators, scores, diffs, ids |

**Tabular numerals are mandatory in every score column.** The signal table is read vertically at eight feet; proportional digits make `0.891` and `0.800` fail to align, and the whole point of that table is that a judge can scan it.

**Fonts are self-hosted woff2 in `apps/web/public/fonts/`.** A Google Fonts link would make the dashboard's layout depend on venue wifi — and we already refuse that on the target for the same reason ([19 §3.2](19-target-apps.md)).

### 2.3 The colour law

| Meaning | Token | Applied to |
|---|---|---|
| FORGE is acting | `--accent` | Agent steps, the active lap, live progress, AI-generated badges |
| Proven safe | `--verified` | `VERIFIED`, passing steps, evidence chips |
| Needs a human | `--review` | `ESCALATED`, the 0.65–0.85 band, deterministic mode |
| **The product is broken** | `--defect` | `DEFECT_FOUND`, veto banners, the defect list |
| **The harness broke** | `--error` | `ERROR`. Nothing else, ever |

`--error` is reserved. **If red appears on stage, something is wrong with us, not with the application under test** — and the team should be able to tell that across the room without reading a word. Giving product defects their own colour rather than red is not decoration: it is the visual form of the argument that finding a bug is a successful outcome.

Nothing is encoded by colour alone. Every status carries a glyph and a word as well.

### 2.4 Motion

| Where | Duration | Curve |
|---|---|---|
| Timeline row entering | 150 ms | `cubic-bezier(.2,0,0,1)` |
| Panel expand / collapse | 200 ms | same |
| Row stagger during a live run | 80 ms between rows | — |
| Everything else | 0 | — |

The stagger reads as thinking rather than as a dump, and it is **purely presentational** — it never gates real progress. `prefers-reduced-motion` collapses every duration to zero, and the layout must be identical with motion off. No page transitions, no skeleton shimmer that outlives its data, no spinners longer than 400 ms without a written reason on screen.

---

## 3. The five screens

| Route | Screen | Owns |
|---|---|---|
| `/` | **Start** | The one input, and the run history beneath it |
| `/s/:sessionId` | **Session** | The capability backlog, the live lap, the running score |
| `/s/:sessionId/laps/:lapId` | **Lap** | Plan → critique → generate → run → decide, as one timeline |
| `/s/:sessionId/decisions/:diagnosisId` | **Decision** | The triage verdict and the healing arithmetic |
| `/s/:sessionId/report` | **Report** | The five mandated contents and the score delta |

Five screens, one per pipeline stage-group, and each maps to a moment in the 4:00 demo. There is no navigation puzzle: the Session screen links to laps, laps link to decisions, everything links to the report.

---

## 4. Screen specifications

### 4.1 Start — `/`

**Purpose:** make the brief's clause `M1` visible in one frame. One field, one button, no configuration.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   FORGE                                                                │
│   Point it at a URL. It explores, plans, critiques, generates,          │
│   runs, and tells you what it could not test.                          │
│                                                                        │
│   ┌──────────────────────────────────────────────┐  ┌──────────────┐   │
│   │  https://                                    │  │  Start  →    │   │
│   └──────────────────────────────────────────────┘  └──────────────┘   │
│                                                                        │
│     ▸ Optional — sign-in, a PRD, what to focus on, mode                 │
│                                                                        │
│   ── Recent ──────────────────────────────────────────────────────     │
│   shop.test          COMPLETED · 1 defect · score 61 → 94    2 min ago  │
│   saucedemo.com      COMPLETED · score 74                    1 hr ago   │
└────────────────────────────────────────────────────────────────────────┘
```

| Element | Detail |
|---|---|
| URL field | Autofocused, `type=url`, the only required input (`FR-001`) |
| Optional drawer | **Collapsed by default.** Username, password, PRD upload, intent, Autopilot/Copilot |
| Primary button | Enabled as soon as the URL parses. `POST /api/sessions`, then navigate to `/s/:id` |
| Recent runs | Status, defect count, score. Clicking one opens a finished session, fully replayable |

**The optional drawer stays shut, and that is a design argument.** Every field visible on this screen is a thing the audience believes the agent needed to be told. `G1` and `G2` are real features and they are one click away — but the default frame has to be a URL and a button, because that is the claim.

**Degraded:** when `FORGE_LLM_ENABLED=false`, an amber strip sits above the field: *"Deterministic mode — no model access. Coverage gaps and plans will be structural only."* We never let the UI imply reasoning that did not happen.

---

### 4.2 Session — `/s/:sessionId`

**Purpose:** show the whole run at a glance while it is happening. This is the screen on the projector longest.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ shop.test                                    ● LAPPING · lap 3 of 5       │
│ 5 capabilities · 31 states · 47 transitions · explored fully              │
│                                                                           │
│ ┌── Capability backlog ─────────────┐  ┌── Robustness ─────────────────┐  │
│ │ 1  Checkout        0.881  ✓ 0.84  │  │                               │  │
│ │ 2  Sign-in         0.792  ✓ 0.79  │  │       61                      │  │
│ │ 3  Account         0.688  ◉ …     │  │  ▁▂▃▄▅▆▇  → 94 if fixed       │  │
│ │ 4  Cart            0.647  ○       │  │  cov 15.0  dep 6.7  det 14.8  │  │
│ │ 5  Browse          0.220  ○       │  │  res 13.3  int 11.0           │  │
│ └───────────────────────────────────┘  └───────────────────────────────┘  │
│                                                                           │
│ ┌── Lap 3 · Account ──────────────────────────────────────────────────┐   │
│ │ ▸ PLAN      6 scenarios drafted                          4.1s   ✓   │   │
│ │ ▸ CRITIQUE  0.61 < 0.70 · 2 blockers → sent back                ↻   │   │
│ │ ▸ PLAN      9 scenarios · gaps addressed                 5.2s   ✓   │   │
│ │ ▸ CRITIQUE  0.84 ≥ 0.70 · 4 residual gaps                3.8s   ✓   │   │
│ │ ▸ GENERATE  9 scenarios · 41 locators validated live      7.9s  ✓   │   │
│ │ ◉ RUN       scenario 4 of 9 …                                       │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

| Component | Detail |
|---|---|
| Header | Target, status chip, lap counter, elapsed. `haltReason` shown as plain words — *"explored fully"* / *"stopped at the state budget"* ([14 §4.1](../03-algorithms/14-quality-report-and-score.md)) |
| Backlog | `priorityRank` order with the risk score. Hovering — and **also** a persistent expander, because projectors have no hover — reveals all six `RiskFactors` |
| Score panel | Live, recomputed after every banked lap. Current, projected, and all five components |
| Lap card | The current lap's stages, appended live. The `↻` re-plan row is styled in `--accent`, not as an error |

**The `↻` row is the 20% innovation score in one line of UI.** *"0.61 < 0.70 · 2 blockers → sent back"* is the orchestrator visibly changing its mind before a line of code was written, and it is on screen without anyone clicking anything.

**States.** *Exploring* → the backlog panel shows a live state/transition count instead of capabilities. *Empty map* → one synthetic capability, with a note saying so (`TG-2`). *Cancelled or budget-stopped* → unreached capabilities render greyed with *"never tested — budget expired"*, which is the same honesty the report is held to.

---

### 4.3 Lap — `/s/:sessionId/laps/:lapId`

**Purpose:** make one capability's reasoning inspectable end to end. Two panes: the timeline, and whatever the selected row is about.

The **coverage diff** is the centrepiece and gets the top of the right pane whenever a `CRITIQUE` row is selected:

```
┌── Coverage · round 0 ──────────────┬── round 1 ─────────────────────────┐
│ score  0.4519   ✗ below 0.70       │ score  0.8435   ✓                  │
│                                    │                                    │
│ A affordances   9/21  ▓▓▓▓░░░░░░   │ A affordances  15/21  ▓▓▓▓▓▓▓░░░   │
│ T transitions   5/12  ▓▓▓▓░░░░░░   │ T transitions   9/12  ▓▓▓▓▓▓▓▓░░   │
│ S states         3/4  ▓▓▓▓▓▓▓░░░   │ S states         4/4  ▓▓▓▓▓▓▓▓▓▓   │
│ C classes        1/4  ▓▓░░░░░░░░   │ C classes        4/4  ▓▓▓▓▓▓▓▓▓▓   │
│ D assertions     4/6  ▓▓▓▓▓▓░░░░   │ D assertions   11/12  ▓▓▓▓▓▓▓▓▓░   │
│                                    │                                    │
│ ⛔ BLOCKER  no negative case        │ 4 residual gaps, listed and open   │
│ ⛔ BLOCKER  no error-state case     │                                    │
└────────────────────────────────────┴────────────────────────────────────┘
```

Three rules make this panel worth its space:

- **Both rounds, side by side, always.** Round 0 is retained by the data model precisely so this comparison can exist ([05 §1](../02-architecture/05-data-model.md)). Showing only the winning plan would delete the evidence for `S-2`.
- **Every term is shown with its numerator and denominator.** `9/21` is checkable; `43%` is not.
- **The residual gaps stay on screen after the pass.** Passing is not the same as complete, and the panel that hides that is the tool this project exists to argue against.

The **plan viewer** renders the Markdown from `GET /laps/:lapId/plans/:round.md` — the same bytes a QA lead would read in a pull request, not a re-rendering of the JSON. The **generation panel** lists dropped scenarios with their reasons, because a scenario that could not be compiled is a coverage gap, not a silence.

---

### 4.4 Decision — `/s/:sessionId/decisions/:diagnosisId`

**Purpose:** prove the agent is not guessing. This is the screen a technical judge asks to see again.

Order on the page is the epistemic claim: **evidence, then arithmetic, then verdict.**

**1 · What happened** — three columns, expected / actual / delta:

| Expected (from the fingerprint) | Actual (live) | Delta |
|---|---|---|
| `role=button name="Place order"` | `role=button name="Place order"` | unchanged |
| `id="place-order"` | `id="btn-a7f3c9"` | **changed** |
| bbox `[1080,728,220,48]` | bbox `[1080,728,220,48]` | unchanged |

**2 · Runtime signals** — `console 0 (+0) · failed requests 0 (+0) · 5xx 0 (+0)`. The `(+n)` deltas are against the baseline and are what `V5` reads. Showing them on every decision means the audience has already met the number before it becomes decisive.

**3 · The candidates**, with every sub-score:

```
  Candidate                                  score    sem  role text   dom   geo  hist
▸ getByRole('button', {name:'Place order'})  0.891   1.00  1.00 1.00  0.95  0.98  0.00
  getByText('Place order')                   0.800   1.00  1.00 1.00  0.95  0.98  0.00
  locator('#order-actions').getByRole(…)     0.650   0.55  1.00 0.40  1.00  0.98  0.00
  locator('xpath=/html/body/main/form/…')    0.200   0.00  0.00 0.00  1.00  0.98  0.00

  gate ≥0.85 auto-heal    margin 0.091 > 0.05    vetoes none
  ceilings  role_name 1.00 · text 0.80 · dom_relative 0.65 · xpath 0.20
```

| Detail | Why |
|---|---|
| Every sub-score, never just the total | The claim is *auditable arithmetic*. Hiding terms undermines it |
| Ceilings shown beneath | Answers the most-asked question — why XPath scores 0.20 with a perfect `dom` term |
| Gate, margin and vetoes on one line | The three things that decided it |
| **Rejected candidates listed** | Showing what was rejected is more convincing than showing what was chosen |
| `hist 0.00` visible | Invites the honest explanation: a first heal is capped at 0.90 by construction |

**4 · The verdict card** (§5.3), and not one pixel above it.

**When a veto fires**, the identical table renders with the winning row struck through and a banner above it:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⛔ HEALING BLOCKED — V2 · destructive-verb veto                          │
│  Candidate "Delete order" scored 0.71 — above the review threshold.       │
│  The accessible name gained a destructive verb. No score overrides V2.    │
└──────────────────────────────────────────────────────────────────────────┘
```

Same table, same columns, one banner. That is Principle 3 doing its work: the audience already knows how to read this table, so the banner is the only new information and it lands at full force.

**When the outcome is `ESCALATED`**, the escalation card renders instead: the one question in a sentence, the fingerprint crop beside the candidate crop, the top two with their margin, the diff that *would* have been applied, and two buttons — **Apply** and **Reject with a reason** (`POST /api/escalations/:id`).

---

### 4.5 Report — `/s/:sessionId/report`

**Purpose:** the closing frame, and the artefact a team keeps. Rendered from the same `QualityReport` document as `report.md` and `report.html` (`FR-805`).

Sections, in this order, because the order is the argument:

1. **The score.** `61` at display size, with `→ 94 if the six findings are fixed`, and the five components broken out. Beneath it, one sentence: *"the biggest single item is that two capabilities were never reached."*
2. **Scenarios covered** — grouped by capability, with class and priority.
3. **Pass / fail outcomes** — passed, failed, healed, flaky, skipped. `FLAKY` is its own column, never folded into passed.
4. **Healer actions** — every decision, including the refusals. Three of four rows being *the system declining to act* is the section's whole value.
5. **Defects found** — expected, actual, reproduction steps, evidence chips. Styled in `--defect`, presented as findings.
6. **Coverage gaps remaining** — **two** sub-sections, never merged: *residual* (we passed and this is still missing) and *accepted risk* (we could not close this in two rounds and proceeded anyway).
7. **Untested flow risk** — ranked by `riskScore`, with the `haltReason` sentence above it constraining what the section is allowed to claim.
8. **Hours saved** — the number with its assumptions rendered immediately beneath it, or nothing at all.
9. **Download** — `suite.zip`, `report.md`, `report.html`.

**The two zero rows in the per-capability table are worth more than any paragraph about honesty**, and they render in full contrast rather than greyed out. A report that dims what it did not do is a report that hopes you will not read it.

---

## 5. Component inventory

### 5.1 `<LapTimeline>`

Rows appended live from the event stream. Each row: a stage glyph, an actor label, a one-line summary, a duration, a status, and inline evidence chips. Failed rows expand by default — nobody should have to click during the money moment. Auto-scroll pauses the instant a user scrolls, because a presenter may want to point at an earlier row.

### 5.2 `<CoverageDiff>`

The §4.3 panel. Takes two `CoverageAssessment`s and renders five term bars each. With one assessment it renders a single column; it never fakes a comparison it does not have.

### 5.3 `<VerdictCard>` — the spine of the UI

One component, four verdicts, identical structure and identical position.

```tsx
type VerdictCardProps = {
  verdict: "VERIFIED" | "DEFECT_FOUND" | "ESCALATED" | "ERROR";
  headline: string;                 // "Healed and verified"
  confidence: number | null;
  reasoning: string;                // ≤400 chars, from Diagnosis.explanation
  evidenceIds: string[];            // rendered as chips — never fewer than 3
  vetoes: string[];                 // ["V2"] → a veto pill
  source: "llm" | "deterministic" | "llm+deterministic";
  actions: Action[];
};
```

| Verdict | Accent | Glyph | Headline |
|---|---|---|---|
| `VERIFIED` | `--verified` | ✓ | "Healed and verified" |
| `DEFECT_FOUND` | `--defect` | ⚑ | "Product defect — healing refused" |
| `ESCALATED` | `--review` | ⚖ | "Needs a human decision" |
| `ERROR` | `--error` | ⚠ | "Harness error" |

**`source` is always rendered.** When it reads `deterministic`, the card says *"Decided without the model — deterministic classifier."* We never let the UI imply reasoning that did not happen, and on stage that line is a strength rather than an apology.

### 5.4 `<SignalTable>`

The §4.4 table. Monospace, tabular numerals, right-aligned, ceilings row, struck-through row on a veto. Renders identically for two candidates or five.

### 5.5 `<ScorePanel>`

Current, projected, five components, and the per-capability table on expand. Every number is recomputable by hand from `GET /sessions/:id/score`, and the panel says so in a footnote — *"every term is published in the report."*

### 5.6 The rest

| Component | Notes |
|---|---|
| `<EvidenceChip evidenceId>` | Type glyph + label; opens image, DOM, JSON or a Trace Viewer hand-off. Shows the sha256 prefix |
| `<CapabilityRow>` | Rank, name, risk score, expandable six-factor breakdown |
| `<GapList>` | Class badge (`MISSING_FLOW` / `MISSING_EDGE_CASE` / `MISSING_ERROR_STATE`), severity pill, `why`, suggested scenario |
| `<DiffView>` | Unified diff; additions `--verified`, deletions `--error` at 60% opacity; provenance header always visible |
| `<ModeBanner>` | The amber deterministic-mode strip |
| `<StatusChip>` | `READY` · `EXPLORING` · `LAPPING` · `NEEDS REVIEW` · `DONE` — glyph and word, never colour alone |

---

## 6. States every panel must define

| State | Rule |
|---|---|
| **Loading** | A skeleton of the real shape, never a spinner alone, never longer than 400 ms without a written explanation |
| **Empty** | A sentence saying what would appear here and why it has not — *"No gaps: this plan cleared the floor with none remaining"* is different from *"no data"* |
| **Degraded** | The amber banner plus `source: deterministic` on every affected card |
| **Partial** | Budget-stopped sections render with what exists and label what is missing |
| **Error** | The API's `requestId` shown, and a retry that re-fetches rather than reloading the page |

Principle 5 is enforced by review: a panel merged without all five is not merged.

---

## 7. Live updates

```ts
const es = new EventSource(`/api/sessions/${id}/stream`);

es.onmessage = (msg) => {
  const evt = JSON.parse(msg.data) as SessionEvent;
  if (evt.seq !== lastSeq + 1) return backfill(lastSeq);   // gap → fetch, never render a hole
  lastSeq = evt.seq;
  reduce(evt);                                             // idempotent, keyed on seq
};

es.onerror = () => { setTransport("polling"); startPolling(id, 1000); };
```

| Concern | Handling |
|---|---|
| Missed event | A `seq` gap calls `GET /events?since=<lastSeq>` and replays — never a partial render |
| Disconnect | `EventSource` reconnects with `Last-Event-ID`; a small *reconnecting* dot appears; polling at 1 s takes over if it fails |
| Mounted after the run finished | Fetch the session, fetch the events, **then** subscribe. Finished sessions replay identically to live ones |
| Duplicate events | The reducer is idempotent on `seq` |
| Tab backgrounded | Buffer, then flush on focus with animation suppressed |

**A finished session and a live one render through the same code path.** That is what makes the demo recoverable: if the network dies mid-run, we reopen the session and everything is still there, because the dashboard was never the source of truth.

---

## 8. Performance budgets

| ID | Budget | Enforced by |
|---|---|---|
| `P-4` | First contentful paint **< 1.0 s**; every interaction **< 100 ms** | Server components for static shells; no client-side data fetching on first paint |
| `P-5` | A streamed event is visible **within 300 ms** of occurring | SSE, no polling in the happy path |
| — | Route transition < 150 ms | Prefetched links; no route-level spinners |
| — | Evidence chip opens < 300 ms | Content-addressed, `immutable`-cached ([17 §5.1](17-api-spec.md)) |
| — | Bundle < 200 KB gzipped on the critical path | No chart library, no component framework, no icon font — inline SVG only |

**No charting library.** The score panel is five bars and a number; the coverage diff is ten bars. Both are `<div>`s with widths. Pulling in a charting dependency to draw a bar would cost more bytes than the entire dashboard.

---

## 9. Accessibility

We read accessibility trees for a living ([08](../02-architecture/08-perception-layer.md)). Shipping an inaccessible dashboard would be a self-inflicted wound, and it is the one critique a judge could make that we would have no answer to.

- WCAG 2.2 AA contrast on every text and glyph pair, verified in CI against the token table
- Every interactive element reachable by keyboard, in visual order, with a visible focus ring
- Landmarks and headings in a real hierarchy — the page's own accessibility snapshot should be legible to *our* Explorer
- Live regions: the lap timeline is `aria-live="polite"`, so a screen reader narrates progress without being flooded
- No hover-only information anywhere — required for screen readers, and independently required by projectors
- `prefers-reduced-motion` honoured; the layout is identical with motion disabled

---

## 10. Projector rules (`NFR-10`)

- Design and verify at **1280×720**, by resizing — not by zooming
- Body text ≥ 15 px; verdict headlines 28 px; the score 40 px; no text below 13 px anywhere
- Max content width 1180 px, centred; peripheral vision at eight feet is unreliable
- Nothing important in the bottom 10% of the viewport — projectors clip, and the front row's heads are there
- No horizontal scroll at 1280 px on any of the five screens
- The presenter's control panel lives on the second screen and is never mirrored ([19 §5.5](19-target-apps.md))

---

## 11. Not building

| Rejected | Why |
|---|---|
| Dark mode toggle | One theme, tested, on the projector. A toggle is a switch that can be in the wrong position on stage |
| Auth or a user menu | Local-first, single user. No judge scores a login screen |
| Charts and analytics | One session is one data point. A chart of one point is a lie |
| Toast notifications | The timeline rows already are the notifications |
| Animated page transitions | Latency the presenter cannot afford |
| A component library | Nine components, all bespoke, all under 120 lines. A design system would be the larger dependency |
| An in-browser code editor | Generated tests are machine-owned (`FR-407`). Offering an editor invites the exact workflow CI forbids |

---

## 12. Acceptance criteria — the checklist we hold ourselves to

- [ ] All five screens render at 1280×720 with no horizontal scroll
- [ ] `<VerdictCard>` renders all four verdicts in an identical structure and position
- [ ] `<SignalTable>` shows all six sub-scores, the total, the ceiling row and the margin
- [ ] The veto banner names the veto id **and the score it overrode**
- [ ] `<CoverageDiff>` shows round 0 beside round 1 with every numerator and denominator
- [ ] Residual gaps remain visible on a *passing* assessment
- [ ] Unreached capabilities render at full contrast, labelled, never dimmed away
- [ ] Every verdict shows ≥ 3 evidence chips, each opening its artefact in < 300 ms (`S-5`)
- [ ] `source` is rendered on every card that reports a judgement
- [ ] An SSE `seq` gap triggers a backfill, never a partial render
- [ ] SSE disconnect degrades to polling with a visible indicator
- [ ] The deterministic-mode banner appears whenever `FORGE_LLM_ENABLED=false`
- [ ] Every panel has designed loading, empty, degraded, partial and error states
- [ ] No colour-only status encoding anywhere
- [ ] `prefers-reduced-motion` removes all motion with no layout change
- [ ] WCAG AA contrast verified in CI; full keyboard traversal; no hover-only information
- [ ] First contentful paint < 1.0 s; interactions < 100 ms (`P-4`)
- [ ] A finished session replays through the identical code path as a live one

---

## 13. Related documents

- The endpoints every panel reads → [17 · API Spec](17-api-spec.md)
- The events the timeline consumes → [05 §2.8](../02-architecture/05-data-model.md)
- The arithmetic the decision screen renders → [13 §8](../03-algorithms/13-triage-and-healing.md)
- The coverage terms the diff panel renders → [11 §3](../03-algorithms/11-coverage-critic.md)
- The report this screen is a view of → [14](../03-algorithms/14-quality-report-and-score.md)
- Which beat each screen serves → [22 · Demo Runbook](../05-delivery/22-demo-runbook.md)
