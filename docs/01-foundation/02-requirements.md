# 02 · Requirements

> **Supersedes** the pre-brief requirement set. The old `FR-1xx`…`FR-5xx` numbering is retired wholesale; §9 carries the migration table so nothing is silently lost.
> **Levels:** `MUST` = the brief demands it, or the demo fails without it. `SHOULD` = cut only via the ladder in [23 · Risk Register](../05-delivery/23-risk-register.md). `MAY` = stretch.

**Traceability rule.** Every `MUST` maps to at least one task in [20 · Execution Plan](../05-delivery/20-execution-plan.md) and at least one assertion in [16 · Agent Test Suite](../04-build/16-agent-test-suite.md). A `MUST` with an empty row in §8 is a build blocker, not a TODO.

**ID scheme.** The hundreds digit is the pipeline stage. Read `FR-3xx` and you already know it is the Critic.

| Range | Stage | Owner component |
|---|---|---|
| `FR-0xx` | Input & session | Orchestrator |
| `FR-1xx` | Exploration & auth | Explorer |
| `FR-2xx` | Planning | Planner |
| `FR-3xx` | Coverage critique | Critic |
| `FR-4xx` | Generation | Generator |
| `FR-5xx` | Execution & evidence | Runner |
| `FR-6xx` | Triage & classification | Triage |
| `FR-7xx` | Healing & decision | Healer |
| `FR-8xx` | Reporting & scoring | Reporter |
| `FR-9xx` | Orchestration, gates, resilience | Orchestrator |
| `NFR-n` | Cross-cutting | Everyone |

---

## 0. Input & session (FR-0xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-001` | MUST | Accept a session as `{url}` where **`url` is the only required field**. Everything else is optional. | `POST /api/sessions {"url":"https://x.test"}` returns `201`. No other field is required by the schema. A missing `url` returns `400` with a Zod issue list. |
| `FR-002` | MUST | Begin the pipeline autonomously on creation — no second call, no prompt, no confirmation. | The session transitions `CREATED → EXPLORING` within 2 s of the `201`, with no further request. |
| `FR-003` | SHOULD | Accept optional credentials `{username, password}` and use them to reach authenticated state. | Given valid credentials for the target, the Explorer reports `authenticated: true` and the capability map contains at least one post-login state. |
| `FR-004` | SHOULD | Accept an optional PRD (Markdown or plain text, ≤ 200 KB) that informs Planner scope. *(Brief: Good to Have)* | With a PRD supplied, `TestPlan.sourceRefs[]` cites at least one PRD section id. |
| `FR-005` | SHOULD | Accept optional natural-language intent, e.g. *"focus on checkout and authentication"*. *(Brief: Good to Have)* | The named capabilities rank in the top 3 of the backlog when present in the map. |
| `FR-006` | MUST | Never persist credentials in plaintext, in evidence, in logs, or in generated test files. | Generated specs read from `process.env`. A grep of `artifacts/` and `tests/` for the password literal returns zero hits — asserted by a unit test. |
| `FR-007` | SHOULD | Accept an optional `mode: "autopilot" \| "copilot"`, defaulting to `autopilot`. | Omitting the field yields an unattended run to completion. |
| `FR-008` | MAY | Accept a `budget: {maxCapabilities, maxDurationMs, maxUsd}` envelope. | Exceeding any budget ends the session `COMPLETED_PARTIAL`, never `ERROR`. |
| `FR-009` | SHOULD | Freeze a validated, redacted configuration snapshot at session creation. | Replaying a session after environment changes uses the persisted snapshot and exposes the same SHA-256 digest in its report and events. |

**On `FR-001`.** This requirement is why the API takes a session object rather than positional arguments: it lets every later capability arrive as an optional field without changing the required surface. The brief's *"sole required input"* is a contract we can point at in code, not a claim in a README.

---

## 1. Exploration & authentication (FR-1xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-101` | MUST | Detect a login form without configuration, using role/label/type heuristics before any model call. | Against three targets with structurally different login pages, the deterministic detector locates username, password and submit in all three. |
| `FR-102` | MUST | Authenticate once, persist `storageState`, and reuse it for all later navigation and every generated test. | `.auth/state.json` exists after exploration; generated specs declare it via a setup project and perform zero interactive logins. |
| `FR-103` | MUST | Explore autonomously from the entry URL and emit a `CapabilityMap` — a state graph of screens, transitions and interactive affordances. | For the reference target, the map contains ≥ 6 states and ≥ 10 transitions, and every state has a stable `signature`. |
| `FR-104` | MUST | Perceive pages via accessibility snapshots (roles, names, refs), not raw HTML dumps. | Snapshot payload per state stays under 8 KB for a page whose raw DOM exceeds 200 KB. |
| `FR-105` | MUST | Cluster raw states into named **capabilities** — user-meaningful units such as *"Checkout"*, not routes. | Every capability has a name, a description, an entry state, and ≥ 1 exit condition. |
| `FR-106` | MUST | Be **strictly read-only by default**: never submit a destructive action during exploration. | A deny-list of verbs (delete, remove, cancel, pay, transfer, deactivate…) blocks submission; blocked affordances are recorded as `observedNotExercised`, not dropped. |
| `FR-107` | MUST | Terminate. Exploration ends on frontier exhaustion, a state budget, or a wall-clock budget — whichever comes first. | Exploration of a deliberately cyclic target halts within its budget and returns a valid partial map. |
| `FR-108` | SHOULD | Deduplicate near-identical states by structural signature so pagination does not explode the graph. | A 50-page list yields one state, with `visitedVariants: 50`. |
| `FR-109` | SHOULD | Stay on the target origin unless explicitly allowed. | An off-origin navigation is recorded and the crawl returns to the last in-origin state. |
| `FR-110` | MAY | Capture a network summary per state to infer an API surface. | Endpoints appear on `CapabilityMap.apiHints[]`. |

**On `FR-106`.** Exploring somebody's live application means clicking things. A crawler that finds the delete button and presses it is not a testing tool, it is an incident. Read-only by default is a safety property; the demo makes it visible by showing what the Explorer *declined* to press.

---

## 2. Planning (FR-2xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-201` | MUST | Produce a `TestPlan` per capability containing scenarios with preconditions, ordered steps and expected outcomes. | `TestPlanSchema` validates; ≥ 3 scenarios and ≥ 1 assertion per scenario. |
| `FR-202` | MUST | Emit the plan as **human-readable Markdown** alongside canonical JSON, from one source. | `plans/<capability>.md` renders as a document a QA lead can review without tooling; regenerating from JSON is byte-identical. |
| `FR-203` | MUST | Cover more than happy paths: each plan contains ≥ 1 negative case, ≥ 1 boundary case and ≥ 1 error-state case, or states in the plan why none exists. | Enforced by the Critic at `FR-302`; a plan without them and without a stated reason is rejected. |
| `FR-204` | MUST | Ground every step in an observed affordance from the capability map. | Every step carries `stateId` and `affordanceRef`; a step referencing an unobserved element fails validation. |
| `FR-205` | MUST | Give each scenario a stable `scenarioId` that survives re-planning. | Re-planning the same capability preserves ids for unchanged scenarios; the diff shows only genuine changes. |
| `FR-206` | SHOULD | Assign each scenario a priority in `P0`…`P3` with a stated reason. | Every scenario has `priority` and a `priorityReason` under 120 chars. |
| `FR-207` | SHOULD | Reflect PRD content when supplied, citing the section behind each derived scenario. *(Brief: Good to Have)* | `FR-004` acceptance, plus ≥ 1 scenario existing *only* because of the PRD. |
| `FR-208` | SHOULD | Reflect natural-language intent in scenario selection and ordering. *(Brief: Good to Have)* | `FR-005` acceptance. |
| `FR-209` | SHOULD | Never plan a step whose effect is irreversible on a target the user has not marked disposable. | Destructive scenarios are emitted as `plannedNotGenerated` with a reason, and appear in the report as a known gap. |

---

## 3. Coverage critique (FR-3xx) — the brief's hard MUST

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-301` | MUST | Evaluate every plan **before** it reaches the Generator, emitting a `CoverageAssessment`. | The FSM cannot transition `PLAN → GENERATE` without an assessment; the transition is guarded and unit-tested. |
| `FR-302` | MUST | Name gaps in three explicit classes the brief calls out: **missing flows**, **missing edge cases**, **missing error states**. | `CoverageAssessment.gaps[]` entries carry `class`, `title`, `why`, `severity` and a `suggestedScenario`. |
| `FR-303` | MUST | Score coverage in `[0,1]` from the capability map — affordances exercised, transitions traversed, states reached. | The score is reproducible from stored inputs; a golden fixture yields an identical score across five runs. |
| `FR-304` | MUST | **Block and re-plan** when the score is below the floor or any `BLOCKER` gap exists. | `EC-03`: the first plan is rejected, the Planner is re-invoked with the named gaps, and the second plan clears the floor. |
| `FR-305` | MUST | Cap re-planning at 2 rounds per capability, then proceed with gaps recorded as accepted risk. | `EC-04` exits after exactly 2 rounds; the report lists the residual gaps as `acceptedRisk`. |
| `FR-306` | MUST | Emit a residual gap list even when the plan passes — passing is not the same as complete. | A green assessment still carries `residualGaps[]`, possibly empty, and the report renders it. |
| `FR-307` | SHOULD | When a PRD is supplied, diff the plan against stated requirements and surface uncovered ones. *(Brief: Bonus)* | `CoverageAssessment.prdGaps[]` names the uncovered requirement and cites its PRD section. |
| `FR-308` | SHOULD | Degrade to the deterministic structural critic when the model is unavailable — never skip the stage. | With no API key, `FR-301` still holds and `assessmentSource: "deterministic"`. |

**Why this is the most valuable section in the document.** `FR-304` is the requirement that makes the orchestrator visibly *think*. Any team can chain three prompts. The observable moment where a plan is sent back with named deficiencies, and the second attempt is measurably better, is the demo beat that earns the 20% innovation weight.

---

## 4. Generation (FR-4xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-401` | MUST | Compile a `TestPlan` into executable Playwright TypeScript **deterministically** — the model emits data, the compiler emits code. | Compiling the same plan twice is byte-identical. No model output is ever `eval`ed, templated into code, or written to disk as source. |
| `FR-402` | MUST | Validate every locator against the live page before writing the file. | Each generated locator resolves to exactly 1 element at generation time; the resolved count is stored on the step. |
| `FR-403` | MUST | Validate every assertion by executing it live and confirming it passes on the current build. | A generated assertion that cannot pass is rewritten or the scenario is dropped with a stated reason — never emitted red. |
| `FR-404` | MUST | Build locators via the priority ladder: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId` → CSS → never raw XPath. | `pnpm forge lint:locators` fails when a lower rung is used while a higher one resolved uniquely. |
| `FR-405` | MUST | Emit a **portable, standalone Playwright project** that runs under plain `npx playwright test` with FORGE uninstalled. | `EC-07`: copy `out/` to a clean directory, `npm i && npx playwright test`, suite runs. |
| `FR-406` | MUST | Record an `ElementFingerprint` for every interactive step at generation time. | Every `click`/`fill` step has a non-null fingerprint before the first run. |
| `FR-407` | MUST | Write generated code only under `tests/generated/**`; that path is machine-owned. | A human commit touching it fails CI. Enforced by a path check, not a convention. |
| `FR-408` | SHOULD | Generate one spec file per capability, importing shared setup. | File count equals capability count; no cross-capability imports. |
| `FR-409` | SHOULD | Include the plan's scenario id and a link back to the plan in each test's title. | `test('[SC-014] guest checkout applies tax', …)`. |

**On `FR-401`.** This is the load-bearing decision of the whole build ([ADR-002](../decisions/ADR-002-llm-role.md)). It means: generated tests are reviewable, generation is reproducible, a bad model response produces a validation error rather than a code-injection vector, and the demo survives the model being down.

---

## 5. Execution & evidence (FR-5xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-501` | MUST | Execute against Chromium with fixed viewport, frozen clock where the app permits, and animations disabled. | Two consecutive runs of `EC-01` produce identical verdicts. |
| `FR-502` | MUST | Capture per step: DOM snapshot, screenshot, element bounding box, console errors, network summary. | ≥ 5 `Evidence` rows per executed step. |
| `FR-503` | MUST | Capture a Playwright trace per run, exposed from the dashboard. | `artifacts/runs/<runId>/trace.zip` exists; the UI link opens Trace Viewer. |
| `FR-504` | MUST | Stream progress with under 300 ms latency per event. | SSE `/api/sessions/:id/stream` emits stage, step and decision events in order with a monotonic `seq`. |
| `FR-505` | MUST | Every `Evidence` row is immutable and content-addressed. | The path contains a SHA-256 prefix; rewriting is rejected. |
| `FR-506` | SHOULD | Run independent capabilities in parallel with configurable worker count. *(Brief: Good to Have)* | `workers: 4` reduces wall clock on a 4-capability suite by ≥ 40% versus serial, with identical verdicts. |
| `FR-507` | SHOULD | Redact secrets from all captured evidence before persistence. | `authorization`, `cookie`, `set-cookie` and key-shaped strings are masked; asserted by unit test. |
| `FR-508` | SHOULD | Support headed mode for demo-day visual runs. | `--headed` opens a visible browser. |
| `FR-509` | MUST | Quarantine rather than trust a flaky test: a step that passes on retry is marked `FLAKY`, not `PASSED`. | A deliberately intermittent fixture yields `FLAKY` and appears in the report's own section. |

---

## 6. Triage & classification (FR-6xx) — the brief's Bonus

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-601` | MUST | Classify each failure into exactly one of six causes: `LOCATOR_BREAK`, `CONTENT_DRIFT`, `PRODUCT_BUG`, `FLAKY`, `ENVIRONMENT`, `UNKNOWN`. | `Diagnosis.kind` is schema-validated against that enum. |
| `FR-602` | MUST | Return `confidence` in `[0,1]`, ≥ 3 `evidenceIds`, an explanation under 400 chars, and a recommended action. | `DiagnosisSchema` passes; every evidence id resolves. |
| `FR-603` | MUST | Reason **only** over supplied evidence — no unconstrained page access during diagnosis. | The diagnosis call receives a serialised bundle; no tool available to it can fetch a new page. |
| `FR-604` | MUST | Produce a deterministic pre-classification before any model call; the model may refine but never override a veto. | `preClassify()` unit tests cover all six kinds; veto results carry `final: true`. |
| `FR-605` | MUST | Degrade to the deterministic classifier when the model fails or returns invalid JSON twice. | With the key removed, `EC-01`…`EC-07` still pass with `diagnosisSource: "deterministic"`. |
| `FR-606` | MUST | State the *product-bug* verdict as a defect report a developer can act on: what was expected, what happened, how to reproduce. | `Diagnosis.defectReport` is non-null for `PRODUCT_BUG` and contains all three fields. |
| `FR-607` | SHOULD | Attach a human-readable evidence timeline to every diagnosis. | Rendered on the failure detail screen. |

---

## 7. Healing & decision (FR-7xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-701` | MUST | Generate at most 5 deduplicated locator candidates from the ladder, each with a live-resolved element count. | `generateCandidates()` returns ≤ 5 with no duplicate locator strings. |
| `FR-702` | MUST | Score every candidate with six weighted signals; all sub-scores are persisted. | `HealCandidate.signals` has all six keys; `score` equals the weighted sum to within 1e-6. |
| `FR-703` | MUST | Apply confidence gates: ≥ 0.85 auto-heal; 0.65–0.85 escalate; < 0.65 fail with evidence. | Boundary unit tests at 0.6499 / 0.65 / 0.8499 / 0.85. |
| `FR-704` | MUST | Enforce **five hard vetoes** that no score can override. | Each veto has a dedicated test producing `HEAL_BLOCKED` with its veto id. |
| `FR-705` | MUST | Never propose a heal for an assertion failure. | `EC-06` returns `FAIL_WITH_EVIDENCE` with zero candidates emitted. |
| `FR-706` | MUST | Patch the persisted plan **and** regenerate the spec file on an accepted heal. | `git diff tests/generated/` is non-empty after `EC-05`. |
| `FR-707` | MUST | Re-run the healed step, then the **entire** flow, before declaring success. | `Run.verification.fullFlowRerun === true` and status is `VERIFIED`. |
| `FR-708` | MUST | Cap healing at 2 attempts per step and 3 per capability, then escalate. | `EC-04` exits `ESCALATE` after exactly 2 attempts. |
| `FR-709` | MUST | Emit a unified diff for every patch. | `TestPatch.diff` parses as a valid unified diff. |
| `FR-710` | MUST | **Roll back** a patch whose verification fails, restoring the prior file byte-for-byte. | After a failed verification, the file hash equals the pre-patch hash; the attempt is retained as evidence. |
| `FR-711` | SHOULD | Reuse historical fingerprints across runs to raise the historical-similarity signal. | The second run of `EC-05` scores at least as high as the first. |

**On `FR-710`.** Retry without rollback is how automated repair corrupts a repository. Every patch is applied inside a transaction whose commit point is *verification passing*, not *the write succeeding*.

---

## 8. Reporting & scoring (FR-8xx) — the brief's hard MUST

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-801` | MUST | Emit a `QualityReport` containing all five contents the brief names: scenarios covered, pass/fail outcomes, healer actions taken, coverage gaps remaining, untested flow risk. | Five non-optional top-level fields; a schema test asserts each is populated on `EC-07`. |
| `FR-802` | MUST | Compute a **Robustness Score** in `[0,100]` from a published, deterministic formula. | The formula is in [14 §3](../03-algorithms/14-quality-report-and-score.md); recomputing from stored inputs reproduces the score exactly. |
| `FR-803` | MUST | Show the score **delta** — the value now, and the projected value if the open findings are fixed. | `score.current` and `score.projected` both present, with the contribution of each finding itemised. |
| `FR-804` | MUST | Rank untested flows by risk rather than listing them alphabetically. | Every entry carries `riskScore` and the factors behind it. |
| `FR-805` | MUST | Render the report as HTML and Markdown, and expose it as JSON. | All three exist for the same run and agree field-for-field. |
| `FR-806` | SHOULD | Show per-capability score contribution so a team knows where to spend the next hour. | A per-capability table with each capability's points lost and why. |
| `FR-807` | SHOULD | Estimate manual-QA hours saved from measured pipeline timings and scenario count. | Stated with its assumptions visible, not as a bare marketing number. |

**On `FR-803`.** *"Your suite scores 34. Fix these four findings and it scores 71."* That sentence is the entire business-impact criterion, and it is arithmetic we can show, not a claim we assert.

---

## 9. Orchestration, gates & resilience (FR-9xx)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `FR-901` | MUST | Drive the pipeline as a typed finite state machine — no open-ended agent loop. | Every transition is an enumerated case; an illegal transition throws at compile time and is unit-tested at runtime. |
| `FR-902` | MUST | Process capabilities as **laps**: one capability is planned, critiqued, generated, run, healed and reported before the next begins. | The event log shows no interleaving between laps in serial mode. |
| `FR-903` | MUST | Persist every state transition before emitting it, so a mid-run restart resumes from storage. | Killing the API mid-lap and restarting resumes the same session at the same lap. |
| `FR-904` | MUST | Terminate in exactly one of: `COMPLETED`, `COMPLETED_PARTIAL`, `ESCALATED`, `ERROR`. | Exit codes 0 / 0 / 2 / 3. A found defect is `COMPLETED`, not `ERROR`. |
| `FR-905` | MUST | Isolate sub-agent failure: one failed lap never aborts the session. | Injecting a Planner failure on lap 2 of 4 still yields a report covering laps 1, 3 and 4. |
| `FR-906` | MUST | Retry every model call and browser action with bounded exponential backoff and a hard ceiling. | Retry policy is declared per call site in [21 · Resilience](../05-delivery/21-resilience.md); no unbounded loops exist. |
| `FR-907` | SHOULD | In Copilot mode, checkpoint between laps and rehydrate on resume. | Approving after an hour resumes without re-exploring. |
| `FR-908` | SHOULD | Tier gates by risk: auto-approve reversible, notify recoverable, block irreversible. | Only irreversible actions block, and only in Copilot mode. |
| `FR-909` | SHOULD | Let a human inject a custom scenario into any capability in Copilot mode. | The scenario joins the plan, is critiqued and generated like any other, and is marked `source: "human"`. |

---

## 10. Non-functional (NFR-x)

| ID | Level | Requirement | Acceptance criteria |
|---|---|---|---|
| `NFR-1` | MUST | **Determinism.** Same seed, commit and browser produce the same verdicts. | `pnpm eval --repeat 5` shows zero verdict variance. |
| `NFR-2` | MUST | **Degraded operation.** Everything except plan quality works with no model access. | Rehearsal `R-2` with the key removed. |
| `NFR-3` | MUST | **Latency.** `P-1`…`P-5` in [01 §7.2](01-vision-and-scope.md) are budgets, not aspirations. | Timed in eval output; a regression fails the gate. |
| `NFR-4` | MUST | **Auditability.** Every transition is an append-only event with timestamp and actor. | `session_events` table; no `UPDATE` is issued against it. |
| `NFR-5` | MUST | **Safety.** No `eval`, no shell from model output, no writes outside `tests/generated/**` and `artifacts/**`. | Path allowlist enforced in `store`; a traversal-escape test exists. |
| `NFR-6` | MUST | **Target safety.** No destructive action against the target without explicit opt-in. | `FR-106`, `FR-209`; the deny-list is a unit-tested constant. |
| `NFR-7` | MUST | **Reproducibility.** Node, pnpm, Playwright browser revision and model id are pinned. | `pnpm forge doctor` verifies all four and exits non-zero on drift. |
| `NFR-8` | SHOULD | **Cost.** A full session on a 10-capability app stays under $2.00. | Token accounting logged per call site and totalled on the report. |
| `NFR-9` | MUST | **Reset.** One command returns the system to a pristine state in under 20 s. | `pnpm forge reset`. |
| `NFR-10` | SHOULD | **Legibility.** Every panel is readable at 1280×720 on a projector. | Rehearsal check. |

---

## 11. Trace matrix

| Group | Brief clause | Execution-plan phase | Eval cases |
|---|---|---|---|
| `FR-0xx` | M1, G1, G2 | Ph1 | `EC-01` |
| `FR-1xx` | M2 | Ph2 | `EC-01`, `EC-02` |
| `FR-2xx` | M2, M3, G1, G2 | Ph3 | `EC-02`, `EC-03` |
| `FR-3xx` | **M4**, B1 | Ph3 | **`EC-03`**, `EC-04` |
| `FR-4xx` | M5 | Ph4 | `EC-01`, `EC-07` |
| `FR-5xx` | M6, G3 | Ph4 | `EC-01`, `EC-05` |
| `FR-6xx` | M6, **B2** | Ph5 | `EC-05`, `EC-06` |
| `FR-7xx` | M6 | Ph5 | `EC-04`, `EC-05`, `EC-06` |
| `FR-8xx` | **M7** | Ph6 | **`EC-07`** |
| `FR-9xx` | M1 | Ph1, Ph6 | all, `R-1`, `R-2` |
| `NFR-x` | — | all | all, `R-1`…`R-4` |

---

## 12. Migration from the pre-brief requirement set

The old numbering is retired. Nothing was deleted without a destination.

| Old | Disposition | New |
|---|---|---|
| `FR-101` (target with intent) | Split; intent no longer required | `FR-001`, `FR-005` |
| `FR-102` (intent → TestSpec) | Replaced by exploration-grounded planning | `FR-201`, `FR-204` |
| `FR-103` (persist JSON + TS) | Retained, generalised | `FR-401`, `FR-405` |
| `FR-104` (locator ladder) | Retained verbatim | `FR-404` |
| `FR-105` (editable plan) | Retained, now Copilot-scoped | `FR-909` |
| `FR-106` (Figma import) | Dropped with the design pillar | [ADR-013](../decisions/ADR-013-design-intelligence-deferred.md) |
| `FR-201`…`FR-207` (execution/evidence) | Retained, renumbered | `FR-501`…`FR-508` |
| `FR-301`…`FR-306` (diagnosis) | Retained; `DESIGN_DRIFT` → `CONTENT_DRIFT` | `FR-601`…`FR-607` |
| `FR-401`…`FR-410` (healing) | Retained; rollback added | `FR-701`…`FR-711` |
| `FR-501`…`FR-507` (design intelligence) | **Deferred in full** | [deferred/](../deferred/design-intelligence.md) |
| `NFR-1`…`NFR-9` | Retained; target safety and cost added | `NFR-1`…`NFR-10` |

**The one semantic change worth flagging:** the failure cause `DESIGN_DRIFT` becomes `CONTENT_DRIFT`. The old name presumed a design contract we no longer maintain. The new one covers what actually happens on an arbitrary application — the copy on a button changed, a currency symbol moved, a label was reworded — which is a genuine and common cause that must not be confused with a locator break.

---

## 13. Open questions

| # | Question | Default in force |
|---|---|---|
| `Q-1` | Will the organiser supply a target URL, and will it be reachable from our machine? | Assume no. Ship with three of our own ([19](../04-build/19-target-apps.md)); switching targets is rehearsal `R-3`. |
| `Q-2` | Is venue internet reliable? | Assume not. `NFR-2` degraded operation is mandatory, not optional. |
| `Q-3` | Will the target rate-limit or bot-block an automated crawler? | Assume it might. Exploration is politeness-throttled and backs off on `429`. |
| `Q-4` | Demo duration? | Build for 4:00, rehearse a 2:30 cut. |

Every row ships with its default already in force. An answer that arrives later is a correction, not a prerequisite.
