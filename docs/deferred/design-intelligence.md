# 09 · Design Intelligence (Daedalus)

> **The trap to avoid:** reducing "design intelligence" to screenshot diffing. A pixel diff cannot tell you whether a change is a bug, and it produces a wall of red rectangles that judges learn to distrust within ten seconds.
>
> **Our approach:** the contract is *structured and declarative*. Pixels are one signal among four, and never the only basis for a finding.

---

## 1. Four evidence layers

| Layer | Source | What it can prove | What it cannot |
|---|---|---|---|
| **Structural** | accessibility tree, DOM | element exists, has the right role, hierarchy is sound | that it looks right |
| **Semantic** | accessible names, labels, headings | the right thing is named the right way | that it is placed correctly |
| **Geometric** | bounding boxes, computed style | position, size, spacing, contrast | intent |
| **Pixel** | masked screenshot diff | *something* changed in a region | *what* changed, or whether it matters |

Findings are raised from the first three. Pixel evidence **corroborates** a finding and gives the UI something to show; it never originates one. That single rule eliminates the noise problem that makes visual-regression tools annoying.

---

## 2. The design contract

`fixtures/design/checkout.contract.json` — reference screenshot plus structured facts plus declarative rules.

```jsonc
{
  "id": "dc_checkout_v1",
  "screen": "Checkout",
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 1 },
  "referenceScreenshotPath": "fixtures/design/checkout.reference.png",

  "elements": [
    { "id": "header",  "type": "region",  "role": "banner",
      "name": null, "bounds": [0, 0, 1440, 76], "required": true, "tolerancePx": 4 },

    { "id": "title",   "type": "heading", "role": "heading",
      "name": "Checkout", "bounds": [120, 124, 400, 44],
      "style": { "fontSize": 32 }, "required": true, "tolerancePx": 8 },

    { "id": "summary", "type": "region",  "role": "region",
      "name": "Order summary", "bounds": [1040, 200, 280, 420], "required": true },

    { "id": "coupon",  "type": "input",   "role": "textbox",
      "name": "Coupon code", "bounds": [120, 520, 300, 44], "required": true },

    { "id": "cta",     "type": "button",  "role": "button",
      "name": "Place order", "bounds": [1080, 728, 220, 48],
      "style": { "backgroundColor": "#4f39d6", "color": "#ffffff", "radius": 10 },
      "required": true, "tolerancePx": 12 },

    { "id": "total",   "type": "text",    "role": null,
      "name": "Total", "bounds": [1040, 640, 280, 32], "required": true }
  ],

  "masks": [
    { "x": 1040, "y": 160, "w": 280, "h": 24 },   // order id — volatile
    { "x": 120,  "y": 60,  "w": 200, "h": 16 }    // session timestamp
  ],

  "rules": [
    { "id": "R-CTA-FOLD",     "check": "DC-04", "severity": "MAJOR",
      "params": { "elementId": "cta" },
      "description": "Primary CTA must be visible without scrolling" },

    { "id": "R-H1-SINGLE",    "check": "DC-03", "severity": "MAJOR",
      "params": { "expectedH1Count": 1 },
      "description": "Exactly one H1, no skipped heading levels" },

    { "id": "R-CTA-CONTRAST", "check": "DC-06", "severity": "MAJOR",
      "params": { "elementId": "cta", "minRatio": 4.5 },
      "description": "CTA text meets WCAG AA contrast" },

    { "id": "R-ERR-ADJACENT", "check": "DC-08", "severity": "MAJOR",
      "params": { "maxDistancePx": 80 },
      "description": "Validation message sits adjacent to its field" },

    { "id": "R-CTA-MOBILE",   "check": "DC-10", "severity": "MINOR",
      "params": { "elementId": "cta", "width": 390 },
      "description": "CTA reachable at 390px without horizontal scroll" }
  ]
}
```

**Why not the live Figma API?** Auth, rate limits, a network dependency on demo day, and a data model we would have to map anyway. This format is the mapping target — a Figma importer becomes a 100-line adapter later without touching the engine. See [ADR-003](../decisions/ADR-003-design-contract-source.md).

---

## 3. The check catalogue

Ten checks. Each is a pure function `(contract, inspection, screenshot) → DesignFinding[]`, each with a passing and a failing fixture (FR-502).

### DC-01 · Element presence
Every `required` element resolves in the live accessibility tree, matched by `role` + accessible name.
**Fails when:** the element is absent. **Severity:** `BLOCKER` if it is the CTA, else `MAJOR`.
**Evidence:** DOM snapshot, screenshot with the expected region outlined.

### DC-02 · Accessible-name fidelity
The live accessible name matches the contract name.
**Fails when:** normalised names differ. **Severity:** `MAJOR`.
**Interaction with healing:** a DC-02 failure on an element whose name gained a destructive verb *reinforces* veto V2. Design intelligence and healing safety share the same signal — a genuine synergy, not two features bolted together.

### DC-03 · Heading hierarchy
Exactly one `h1`; no skipped levels; heading order matches document order.
**Fails when:** 0 or 2+ `h1`, or `h2 → h4`. **Severity:** `MAJOR`.

### DC-04 · Above-the-fold CTA
The CTA's bbox lies entirely within the viewport height at initial scroll.
**Fails when:** `bbox.y + bbox.h > viewport.height`. **Severity:** `MAJOR`.
**Why it matters:** the most common real design regression — someone adds a promo banner and the buy button falls below the fold. Invisible to functional tests, expensive commercially.

### DC-05 · Geometric drift
Per element: `|Δx|, |Δy|, |Δw|, |Δh| ≤ tolerancePx`.
**Fails when:** any exceeds tolerance. **Severity:** `MINOR` under 2×, `MAJOR` beyond.
**Reported as:** `expected [1080,728,220,48] · actual [1080,860,220,48] · Δy +132px`.

### DC-06 · Contrast (WCAG AA)
Computed contrast between `color` and effective `backgroundColor`.
**Fails when:** below 4.5:1 (normal) or 3:1 (≥18.66px or bold ≥14px). **Severity:** `MAJOR`.
Uses the standard relative-luminance formula; resolves `background: transparent` by walking ancestors to the first opaque background.

### DC-07 · Spacing rhythm
Gaps between sibling elements in a region are multiples of the grid unit (default 8px, ±2px).
**Fails when:** a gap is off-grid. **Severity:** `INFO` (one) or `MINOR` (three or more).
Deliberately low severity — this is a taste signal, not a defect, and treating it as one is how design-lint tools lose credibility.

### DC-08 · Error-message adjacency
When a validation error is present, its bbox centre is within `maxDistancePx` of the associated field, and it is programmatically associated (`aria-describedby`).
**Fails when:** too far, or association missing. **Severity:** `MAJOR`.

### DC-09 · Overflow / clipping
No required element has `scrollWidth > clientWidth` with `overflow: hidden`, and no text is visually truncated without an ellipsis affordance.
**Fails when:** content is clipped. **Severity:** `MAJOR`.

### DC-10 · Responsive reachability
Re-render at the configured width; the CTA must be present, visible and reachable without horizontal scroll (`document.scrollWidth ≤ width + 1`).
**Fails when:** horizontal scroll appears or the CTA is unreachable. **Severity:** `MINOR`.
This is the only check that re-renders the page, so it runs last, once, in its own context.

---

## 4. Pixel comparison — the constrained role

Runs **only after** structural checks, **only** on regions that already have a finding, and **only** with masks applied.

```ts
const diff = pixelmatch(referencePng, currentPng, out, w, h, {
  threshold: 0.12,            // per-pixel colour tolerance
  includeAA: false,           // ignore antialiasing
  alpha: 0.4,
});
const changedRatio = diff / (w * h);
```

Preconditions, all mandatory — omit one and the demo becomes a coin flip:

1. Fixed viewport and `deviceScaleFactor`.
2. `prefers-reduced-motion` forced; CSS animations and transitions disabled.
3. Web fonts preloaded and `document.fonts.ready` awaited.
4. Clock frozen at `2026-01-01T00:00:00Z`.
5. Masks from the contract painted before comparison.
6. Same Chromium revision (pinned, NFR-6).

Output is a `DIFF` evidence image with masked regions hatched and the changed region outlined — this is what appears in the Design Checks screen.

---

## 5. Severity → run outcome

| Severity | Effect on run status | UI treatment |
|---|---|---|
| `BLOCKER` | Run fails: `FAIL_WITH_EVIDENCE` | Red banner |
| `MAJOR` | Run continues; reported prominently; **cannot be healed away** | Amber card |
| `MINOR` | Run continues; collapsed list | Grey chip |
| `INFO` | Advisory only | Footnote |

**The separation that makes FR-505 real:** design findings live in `design_findings`, functional outcomes in `runs.status`. A `MAJOR` drift finding on a green run is a legitimate and valuable output — *"your checkout works and your CTA moved 132px, below the fold."* That combination is exactly what neither a functional test suite nor a visual-regression tool produces on its own, and it is the cleanest illustration of why design intelligence belongs inside the QA loop rather than beside it.

---

## 6. Scenario in the demo (EC-03)

1. Mutation **M-04** is enabled in the SUT: a 132px promo banner is injected, pushing the CTA from `y = 728` to `y = 860`. At 1440×900 its lower edge now sits at 908 — past the fold.
2. The functional flow still passes 8/8 — the button is clickable after a scroll.
3. Design checks fire:
   - DC-05 → `MAJOR`, CTA `Δy +132px`
   - DC-04 → `MAJOR`, CTA lower edge 908 > 900
4. Diagnosis kind is `DESIGN_DRIFT`, not `PRODUCT_BUG`, and **no heal is attempted** — nothing is broken to heal.
5. The Evidence Pack reads:

   > *"Checkout functions correctly. A promotional banner moved the primary CTA 132px down, placing its lower edge at 908px — below the fold at 1440×900. Functional tests would not have caught this."*

That last sentence is the point of the whole module.

---

## 7. Deliberate limitations

| Limitation | Why accepted | Later |
|---|---|---|
| One screen, one breakpoint | Depth beats breadth in a 4-minute demo | Contract per screen, breakpoint matrix |
| Contract authored by hand | Removes a network dependency from demo day | Figma importer (FR-106) |
| No component-library / token awareness | Needs a real design system to be meaningful | Token contract + variant checking |
| Contrast on the CTA only | Full-page audit is a different product | Integrate `axe-core` for the accessibility sweep |
| Pixel diff corroborates, never originates | Prevents false-positive noise | Perceptual (SSIM) diff with a learned threshold |
