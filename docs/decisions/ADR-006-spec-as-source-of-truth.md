# ADR-006 · The TestSpec is the source of truth; the `.spec.ts` file is a projection

| | |
|---|---|
| **Status** | Accepted |
| **Decided** | 26 Aug 2026 · D-10 |
| **Deciders** | P1 (compiler owner) · P2 consulted |
| **Requirements** | FR-103, FR-104, FR-406, FR-409, NFR-5 |
| **Governs** | [13 §12](../03-algorithms/13-triage-and-healing.md) · [05 §2.2](../02-architecture/05-data-model.md) |
| **Related risks** | [RK-10](../05-delivery/23-risk-register.md) |

---

## 1. Context

A heal has to change something durable, or the whole product is a dashboard that reports fixes it never made. FR-406 says the patch lands in `apps/sut/tests/` on disk, and `git diff` on that file is the strongest single moment in the demo.

So: which artifact is authoritative — the TypeScript file an engineer would read, or the JSON the system reasons over?

---

## 2. The two options

### Option A — The `.spec.ts` file is the truth

Heal by editing TypeScript: an AST transform (`ts-morph`) that finds the failing locator call and rewrites its arguments, or a model-generated edit to the file.

### Option B — Canonical `TestSpec` JSON is the truth *(chosen)*

`TestSpec` JSON is authoritative. `.spec.ts` is generated from it by a deterministic compiler. A heal updates `TestSpec.steps[i].locator`, bumps `TestSpec.version`, regenerates the file, and diffs old against new content to produce `TestPatch.diff`.

### Comparison

| Criterion | A · patch the TypeScript | B · patch JSON, regenerate |
|---|---|---|
| Fix lands in the repo | Yes | Yes — identical demo asset |
| Round-trip guarantee (FR-103) | N/A — there is nothing to round-trip | Byte-identical regeneration, testable (T-205) |
| Locator-ladder enforcement (FR-104) | Lint the emitted TypeScript — a syntax-level check on a semantic rule | A data check on the strategy field, before any code exists |
| Model may emit code (NFR-5) | With an LLM edit, **yes** — the injection path | Structurally impossible: the model emits `{strategy, args}` |
| A human can hand-edit the test | **Yes** | **No** — and this is a real cost |
| Complexity | AST manipulation, formatting, comment preservation | A template function |
| Version + patch atomicity (I-10) | Derived from file history | One transaction over one document |
| Failure mode | A malformed edit produces a file that will not compile | The same — mitigated by typechecking before verification |
| Diff quality | Minimal, surgical | Whole-file regeneration; noisy if the generator is unstable |

---

## 3. Decision

**Option B.** The `TestSpec` is authoritative and the compiler is total, deterministic and pure.

Three arguments, and the third is the one that decides it:

1. **FR-104 becomes mechanically enforceable.** "Never use a raw XPath when a role+name locator was available" is a claim about *strategy choice*. On the JSON side it is a field comparison; on the TypeScript side it is a lint rule reverse-engineering intent from a call expression. Rules should be checked where the intent lives.
2. **Version and patch are atomic.** `TestSpec.version` increments in the same write that changes the locator (I-10). Under Option A, version is whatever git says, which is not available at decision time.
3. **It closes the code-injection path.** The model emits `{strategy: "role_name", args: {...}}`; a deterministic compiler emits `getByRole('button', { name: 'Place order' })`. NFR-5's "model output is never executed" stops being a policy anyone can accidentally violate and becomes a property of the data flow. Under Option A with a model-generated edit, the model writes code that Playwright then runs — and no amount of review discipline makes that safe on a two-week timeline.

The generated file carries a provenance header naming the spec, the version, the healed step, the run, the before/after locator, the confidence and all six signals. That header is what turns `git diff` from a code change into an argument.

### 3.1 The cost we are choosing to pay

Under Option B **a human cannot hand-edit a test.** Engineers dislike generated files in their repository, and reasonably so. This is the weakest point of the decision and it should be stated before someone finds it: the mitigation is that the *unified diff* is reviewable as a normal pull request even though the file is generated, and the production answer is an `eject` command (§7), not bidirectional sync.

---

## 4. Consequences

**What we accept**

- Hand-edits to `apps/sut/tests/*.spec.ts` are lost on the next regeneration. The provenance header says so in its first line.
- The compiler must be *total*: every schema-valid `TestSpec` must produce TypeScript that typechecks. Any gap is RK-10.
- Whole-file regeneration means diff quality depends on generator stability, including formatter version.

**What it buys**

- FR-103's byte-identical round trip is testable in isolation, with no browser.
- The patch is a single transactional document write; the file is a consequence.
- The healing engine never parses TypeScript, so it stays pure and unit-testable — which is what keeps [ADR-004](ADR-004-locator-scoring.md)'s arithmetic verifiable without a runtime.

---

## 5. Risks

| Risk | Exposure | Control |
|---|---|---|
| A patched `.spec.ts` fails to compile, so full-flow verification cannot run and no heal ever reaches `VERIFIED` | RK-10 · 6 | Deterministic compiler with a byte-identical round-trip test (T-201/T-205); **typecheck the regenerated file before verification**. Contingency: verify against the in-memory `TestSpec` and flag the file write separately |
| Formatter or generator drift makes diffs noisy and the demo asset unreadable | not registered | Generator output is formatted by a pinned formatter; the round-trip test catches drift on the next run |
| A heal is needed that a locator swap cannot express | not registered | Diagnosed, escalated, not silently mis-patched. See A1 |

---

## 6. Hidden assumptions

| # | Assumption | If false | How we would find out |
|---|---|---|---|
| A1 | Every heal is expressible as a locator swap on an existing step | A restructured flow needs a step added or removed, and there is no representation for that. Named in [13 §16](../03-algorithms/13-triage-and-healing.md) as single-element healing | The fingerprint's `ancestorPath` no longer existing **anywhere** in the live DOM. That is a detectable signature of a restructure rather than a rename, and treating it as `LOCATOR_BREAK` would be a mis-diagnosis |
| A2 | The compiler is total over the schema | Exactly RK-10. A valid spec that produces uncompilable TypeScript blocks every heal, not just one | Typecheck the regenerated file **before** verification, so the failure surfaces as a compiler bug rather than as a mysterious verification failure |
| A3 | Round-trip is byte-identical | Depends on stable key ordering *and* formatter agreement. A formatter upgrade silently makes every diff noisy | T-205 asserts it. Worth remembering that this test is really testing two pinned things, not one |
| A4 | Engineers will accept a generated test file in their repo | Roughly half will not, and adoption suffers for a reason that has nothing to do with healing quality | Not measurable before D0. The unified diff is the mitigation; `eject` (§7) is the answer |
| A5 | The `TestSpec` schema is expressive enough for the flows we generate (3–12 steps) | Beyond that it acquires conditionals, loops and expressions — and becomes a programming language with no debugger, the classic configuration-language death spiral | The first pull request adding an `if` to the schema. **That PR is the flip trigger**, and it should be recognised as one rather than merged as a feature |
| A6 | Writes stay inside the allowlist | A traversal escape writes outside `apps/sut/tests/**` — an arbitrary-write primitive fed by model-influenced data | `store.safeWrite()` plus I-9's traversal test. This is why patching goes through `store` rather than `fs` |

---

## 7. Flip triggers

| Trigger | Action |
|---|---|
| The spec schema needs conditionals, loops or expressions (A5) | **Stop.** The source of truth should become code, and healing should become an AST transform — Option A, adopted deliberately rather than drifted into. This is the most likely long-run reversal in this document |
| Humans must hand-edit tests | Add `forge eject`: one-way, the spec becomes read-only history, healing is disabled for that file. Do **not** build bidirectional sync — it fails at the first ambiguous merge |
| A heal requires adding or removing a step | Flow-level replanning against the design contract, as a separate decision. Do not extend locator patching to cover it |
| The compiler fails to typecheck its own output in an eval run | RK-10's contingency: verify against the in-memory `TestSpec`, report the file write as a separate, visible failure. Never claim `VERIFIED` off an unverified file |
| Generated-file diffs become unreadable for reasons other than the heal | Pin the formatter into the freeze manifest alongside Node, pnpm and the browser revision (NFR-6) |

---

## 8. Related

- [ADR-002 · LLM role](ADR-002-llm-role.md) — the model emits data; this ADR is where that pays off
- [ADR-010 · Post-heal verification](ADR-010-post-heal-verification.md) — what happens after the file is rewritten
- [13 §12](../03-algorithms/13-triage-and-healing.md) — the patch sequence and the provenance header
- [05 §2.2](../02-architecture/05-data-model.md) — why assertions are steps, not a separate array
