# target-apps/

> **What this directory is.** Draft, supplementary target-application material that sits outside the numbered, checkpoint-reviewed doc set ([00-work-plan.md §3](../00-work-plan.md)). The canonical target roster — Aperture, SauceDemo, Conduit, the injectable-defect registry, and the cold-switch procedure — lives at [04-build/19-target-apps.md](../04-build/19-target-apps.md) and is not duplicated here.
> **Why a separate directory.** These are specifications written the way `19` was written before Aperture existed — precise enough to build or use from, but not yet reviewed, not frozen, and not cited by any requirement, guard, or golden case. Promoting either of them into the numbered set (a `T4`, a wired-in eval target) is a decision for [19](../04-build/19-target-apps.md) to make explicitly, not something this directory does by existing.

| File | What it is | Status |
|---|---|---|
| [fork-and-flame/README.md](fork-and-flame/README.md) | A full product/build spec for a fourth, Vercel-hosted target app — real Next.js hydration and an injectable-defect catalogue (`RB-nn`), unbuilt | Spec only, not built, not referenced elsewhere |
| [external-platforms.md](external-platforms.md) | A catalogue of ten external, publicly reachable practice sites (`EXT-01`…`EXT-10`) for development-time bug-detection and pattern-coverage checks | Cross-linked into [19](../04-build/19-target-apps.md), [23 · Risk Register](../05-delivery/23-risk-register.md), and [00 · Work Plan](../00-work-plan.md) |

Neither file changes the canonical roster, the DOM contract, the `M-nn` registry, or any `EC-nn` golden case. Both are additive research/spec material, read at the reader's discretion.
