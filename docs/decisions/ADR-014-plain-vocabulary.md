# ADR-014 · Use the brief's vocabulary, not our own mythology

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 4 Sep 2026 |
| **Deciders** | All |
| **Requirements** | Rubric criteria 4 (UX & demo clarity, 15%) and 6 (presentation, 5%) |
| **Governs** | Every document, every identifier, every UI label |

---

## 1. Context

The pre-brief design named its modules after Greek myth: **Argus** (vision), **Daedalus** (design), **Hephaestus** (healing), **Forge** (orchestrator). It is memorable, it gives the pitch personality, and a lot of care went into it.

The brief names three things: **Planner**, **Generator**, **Healer**. It uses those words seven times.

A judge evaluates with the rubric in front of them. Every time our word differs from their word, they perform a translation — and the translation costs attention that was budgeted for understanding what we built.

---

## 2. The two options

### Option A — Keep the mythology, map it in a legend

Argus/Daedalus/Hephaestus stay primary; a table maps them to the brief's terms.

**Its real advantages:** distinctive. Memorable across a day of similar demos. The names carry meaning once learned — Argus had a hundred eyes, and that is genuinely what the perception layer does.

### Option B — Plain names everywhere *(chosen)*

`Explorer`, `Planner`, `Critic`, `Generator`, `Runner`, `Triage`, `Healer`, `Reporter`, `Orchestrator`. **FORGE** remains the product name.

---

## 3. Decision

**Plain names, everywhere: docs, code, UI labels, the deck, the spoken demo.**

Three reasons, in ascending order of importance:

1. **Zero-translation reading.** A judge sees `Planner` on the architecture diagram, looks at their rubric, and reads `Planner`. Nothing is spent.
2. **Newcomer cost is real, and it is us.** At hour six, someone edits a package they have not opened. `packages/agents/critic` tells them what it is. `packages/agents/daedalus` requires either memory or a lookup, and at hour six there is neither.
3. **The names implied the wrong architecture.** Four mythological names invite four autonomous agents — a reading [ADR-008](ADR-008-orchestration-topology.md) had to spend a whole section rejecting. Plain functional names describe pipeline stages, which is what these actually are.

The third reason is the one that convinced us. A naming scheme that requires an ADR to explain what it does *not* mean is a naming scheme with a defect.

### 3.1 What is retained

**FORGE** stays as the product name. It is short, it is a verb about making things, and it is the one name that appears on the deck, the URL and the CLI — where a distinctive name earns its keep. The argument against mythology is about *component* names, which are read hundreds of times by people mid-task. A product name is read once and remembered.

Argus, Daedalus and Hephaestus are retired. `Daedalus` was the design pillar and is deferred anyway ([ADR-013](ADR-013-design-intelligence-deferred.md)); the other two now have plainer and more accurate names, since neither was really doing what its myth suggested.

---

## 4. Consequences

- The pitch loses a small amount of colour. Recovered elsewhere: the score delta, the refuse-to-heal moment, and the coverage-gap re-plan are all more memorable than a name.
- One find-and-replace across docs and scaffolding, done now while the code is scaffolding. The cost of this decision only ever goes up.

### Naming rules that follow

1. A component is named for **what it does**, in one word a QA engineer already uses.
2. Types are nouns from the domain: `CapabilityMap`, `TestPlan`, `CoverageAssessment`, `Diagnosis`, `QualityReport`.
3. No invented word where an industry-standard word exists. We say *flaky*, *locator*, *fixture*, *assertion* — because our users already do.
4. The UI shows the same word the code uses. A label that differs from its identifier is a bug report waiting to be misfiled.

---

## 5. Flip trigger

None that we can foresee. If the product outlives the hackathon and marketing wants codenames, that is a branding decision applied to a stable architecture — not a reason to rename packages mid-build.
