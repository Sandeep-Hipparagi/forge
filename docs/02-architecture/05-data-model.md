# 05 · Data Model

> **Single source of truth:** the Zod schemas in `packages/core/schema/`. TypeScript types are *inferred* from them (`z.infer`), never hand-written in parallel. The SQLite DDL mirrors them.
> **Rule:** if a shape appears in an API response, a model's structured output, and a database row, it is declared **once**, here.
> **Frozen at the end of Ph1.** One Zod edit after that invalidates work in three places at once ([00 · Work Plan §5](../00-work-plan.md)).
> **This document owns:** the `I-n` invariant IDs and the ID prefix table.

---

## 1. Entity relationships

```
Session 1──* SessionEvent                     (append-only, gapless seq — NFR-4)
   │
   ├──1 CapabilityMap 1──* State 1──* Affordance
   │                   └──* Transition   (from → via affordance → to)
   │
   ├──* Capability          (a cluster of States, risk-ranked into the backlog)
   │
   ├──* Lap 1──1 Capability
   │      ├──* TestPlan          (one per re-plan round, ≤ 3)
   │      │      └──* Scenario 1──* TestStep 1──* ElementFingerprint  (history, newest first)
   │      ├──* CoverageAssessment (one per round · 1:1 with TestPlan)
   │      └──* Run 1──1 Scenario
   │             ├──* Evidence
   │             ├──* Diagnosis 1──* HealCandidate
   │             └──* TestPatch
   │
   └──1 QualityReport 1──1 RobustnessScore
```

Three relationships carry real weight and are worth reading twice:

- **`TestPlan` is versioned by round, not overwritten.** Round 0 is the plan the Critic rejected. Keeping it is what lets the dashboard show *"here is what it planned, here is what the Critic said, here is what it planned next"* — the demo beat that earns the innovation weight. A model that overwrites round 0 destroys the evidence for `S-2`.
- **`ElementFingerprint` belongs to a `(scenarioId, stepId)` pair, not to a run.** Runs *append* fingerprints; healing *reads across all of them*. That history is what makes `historicalSimilarity` meaningful on the second and third heal of the same element (`FR-711`).
- **`Lap` owns the counters.** `replanRounds` and `healAttempts` live on the lap, not in a variable in a loop, because `FR-903` requires a mid-run restart to resume with the caps already spent. A counter in memory is a counter that resets when the process does.

---

## 2. Zod schemas (`packages/core/schema/`)

### 2.1 Primitives

```ts
// packages/core/schema/primitives.ts
import { z } from "zod";

export const Id = z.string().regex(/^[a-z]{2,4}_[0-9a-z]{8,}$/);
export const Iso = z.string().datetime();
export const Confidence = z.number().min(0).max(1);
export const Severity = z.enum(["INFO", "MINOR", "MAJOR", "BLOCKER"]);
export const Priority = z.enum(["P0", "P1", "P2", "P3"]);

export const BBox = z.object({
  x: z.number(), y: z.number(), w: z.number(), h: z.number(),
});

export const Viewport = z.object({
  width: z.number().int().positive().default(1440),
  height: z.number().int().positive().default(900),
  deviceScaleFactor: z.number().positive().default(1),
});
```

### 2.2 Session — the only required input is a URL

```ts
// packages/core/schema/session.ts
export const SessionMode = z.enum(["autopilot", "copilot"]);

export const SessionInput = z.object({
  url: z.string().url(),                                  // FR-001 — the ONLY required field
  username: z.string().optional(),
  password: z.string().optional(),                        // never persisted — FR-006
  prd: z.string().max(200_000).optional(),                // FR-004
  intent: z.string().max(2_000).optional(),               // FR-005
  mode: SessionMode.default("autopilot"),                 // FR-007
  budget: z.object({                                      // FR-008
    maxCapabilities: z.number().int().positive().default(20),
    maxDurationMs: z.number().int().positive().default(30 * 60_000),
    maxUsd: z.number().positive().default(2.0),
  }).default({}),
});

// Resolved at creation and frozen for the lifetime of the session. A later
// environment-variable or dashboard change must never reinterpret a run.
export const SessionConfigSnapshot = z.object({
  version: z.literal("forge/v1"),
  secretProvider: z.enum(["env"]),                 // provider identity only; never a secret or reference
  model: z.object({ id: z.string(), enabled: z.boolean(), timeoutMs: z.number().int().positive() }),
  exploration: z.object({ allowedHosts: z.array(z.string()), destructiveActions: z.enum(["deny", "disposable_only"]) }),
  coverage: z.object({ floor: Confidence, maxReplanRounds: z.number().int().min(0).max(2) }),
  healing: z.object({ autoHealThreshold: Confidence, reviewThreshold: Confidence, minMargin: Confidence }),
  budget: SessionInput.shape.budget,
  redactionPolicyVersion: z.string(),
});

export const SessionStatus = z.enum([
  "CREATED", "EXPLORING", "PRIORITISING", "LAPPING", "REPORTING",
  "COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR",              // FR-904
]);

export const Session = z.object({
  id: Id,
  input: SessionInput.omit({ password: true }),   // the password never reaches this object
  status: SessionStatus,
  authenticated: z.boolean().default(false),
  config: SessionConfigSnapshot,
  configSha256: z.string().length(64),              // canonical JSON digest; I-21
  storageStatePath: z.string().nullable().default(null),
  exitCode: z.number().int().min(0).max(3).nullable(),
  defectsFound: z.number().int().nonnegative().default(0),
  createdAt: Iso,
  finishedAt: Iso.nullable(),
  usage: z.object({
    inputTokens: z.number().int(), outputTokens: z.number().int(),
    cacheReadTokens: z.number().int(), calls: z.number().int(),
    estimatedUsd: z.number(),
  }).nullable(),
});
```

> **`SessionInput.omit({ password: true })` is the whole of `FR-006` expressed as a type.** The credential is accepted at the API boundary, used to produce `storageState`, and then it is structurally impossible for it to reach a stored `Session`, an event payload, or a serialised response — because the type it would have to travel in does not have the field. A rule enforced by a schema beats a rule enforced by a code review at hour six.

At creation, the API resolves approved environment and target-profile values, validates `SessionConfigSnapshot`, canonicalises it, and stores its SHA-256 digest beside the session. The dashboard receives a redacted view only. A later configuration change creates `forge/v2`; it never changes how a `forge/v1` report is read.

### 2.3 Perception — State, Affordance, Transition

The algorithms behind these live in [08 · Perception Layer](08-perception-layer.md); the shapes live here.

```ts
// packages/core/schema/perception.ts
export const AffordanceKind = z.enum([
  "button", "link", "textbox", "checkbox", "radio", "select",
  "tab", "menuitem", "form", "upload", "other",
]);

export const Affordance = z.object({
  id: Id,
  stateId: Id,
  ref: z.string(),                       // snapshot-local handle, e.g. "e42"
  role: z.string(),                      // ARIA role
  accessibleName: z.string().nullable(),
  kind: AffordanceKind,
  enabled: z.boolean().default(true),
  bbox: BBox.nullable(),
  /** Matched the destructive-verb deny-list. Recorded, never pressed. FR-106 */
  destructive: z.boolean().default(false),
  /** Seen but deliberately not exercised — deny-listed, budget-capped, or off-origin. */
  observedNotExercised: z.boolean().default(false),
  notExercisedReason: z.string().nullable().default(null),
});

export const State = z.object({
  id: Id,
  sessionId: Id,
  /** Structural hash. Two pages with the same signature are the same state. FR-108 */
  signature: z.string().length(16),
  url: z.string(),
  title: z.string(),
  authRequired: z.boolean().default(false),
  snapshotEvidenceId: Id,                // the accessibility snapshot, content-addressed
  affordanceIds: z.array(Id),
  /** How many raw pages collapsed into this state — a 50-page list is one state. */
  visitedVariants: z.number().int().positive().default(1),
  discoveredAt: Iso,
});

export const Transition = z.object({
  id: Id,
  sessionId: Id,
  fromStateId: Id,
  toStateId: Id,
  viaAffordanceId: Id,
  action: z.enum(["click", "fill", "select", "navigate", "back", "submit"]),
  observedAt: Iso,
});
```

### 2.4 Capability and the map

```ts
export const RiskFactors = z.object({
  authProximity: Confidence,     // how close to the authenticated boundary
  dataMutation: Confidence,      // does it write
  moneyOrPii: Confidence,        // does it touch money or personal data
  graphCentrality: Confidence,   // how many flows pass through it
  affordanceDensity: Confidence, // how much surface area
  statedIntent: Confidence,      // did the user ask for it — FR-005
});

export const Capability = z.object({
  id: Id,
  sessionId: Id,
  name: z.string().min(2),               // "Checkout" — user-meaningful, not a route
  description: z.string().min(10),
  entryStateId: Id,
  stateIds: z.array(Id).min(1),
  exitConditions: z.array(z.string()).min(1),          // FR-105
  dependsOn: z.array(Id).default([]),                  // ADR-012 A1
  risk: z.object({ score: Confidence, factors: RiskFactors }),
  priorityRank: z.number().int().nonnegative(),        // backlog order — deterministic
});

export const CapabilityMap = z.object({
  sessionId: Id,
  authenticated: z.boolean(),
  states: z.array(State),
  transitions: z.array(Transition),
  capabilities: z.array(Capability),
  apiHints: z.array(z.object({            // FR-110
    method: z.string(), urlPattern: z.string(), seenInStateIds: z.array(Id),
  })).default([]),
  frontier: z.object({
    discovered: z.number().int(), explored: z.number().int(),
    haltReason: z.enum(["EXHAUSTED", "STATE_BUDGET", "TIME_BUDGET", "CALL_BUDGET"]),
  }),                                                  // FR-107
});
```

> **`haltReason` is not diagnostics — it is a report field.** Exploration always terminates, and *why* it stopped changes what the untested-flow risk section is allowed to claim. A map that halted on `EXHAUSTED` supports "we have seen the application"; one that halted on `STATE_BUDGET` supports only "we have seen this much of it", and the report must say the difference out loud (`FR-804`).

### 2.5 TestPlan, Scenario, TestStep

`Scenario` is the entity the pre-brief model called `TestSpec`. The rename is real: a spec was one test, a scenario is one of several inside a capability's plan.

```ts
// packages/core/schema/plan.ts
export const StepKind = z.enum([
  "navigate", "click", "fill", "select", "press", "hover",
  "waitFor", "assertText", "assertVisible", "assertUrl", "assertCount",
]);

/** Truth claims. Steps of these kinds are NEVER healed. See FR-705, veto V1. */
export const ASSERTION_KINDS = [
  "assertText", "assertVisible", "assertUrl", "assertCount",
] as const;

export const TestStep = z.object({
  id: z.string().regex(/^s\d+$/),        // scenario-local: s1, s2, …
  order: z.number().int().nonnegative(),
  kind: StepKind,
  /** Human-language purpose. Survives every refactor. The anchor for healing. */
  targetIntent: z.string().min(3).max(160),
  /** FR-204 — grounding. Both must resolve in the CapabilityMap or validation fails. */
  stateId: Id,
  affordanceRef: z.string().nullable(),  // null only for `navigate`
  locator: z.string().nullable(),        // written by the compiler, not the model
  input: z.string().nullable(),
  timeoutMs: z.number().int().default(5000),
  optional: z.boolean().default(false),
  fingerprintId: Id.nullable().default(null),
  /** Set at generation time by the live probe. Must be 1 to be emitted. FR-402 */
  resolvedCount: z.number().int().nullable().default(null),
});

export const ScenarioClass = z.enum(["happy", "negative", "boundary", "error_state"]);

export const Scenario = z.object({
  id: z.string().regex(/^SC-\d{3,}$/),   // stable across re-planning — FR-205
  planId: Id,
  title: z.string().min(5),
  class: ScenarioClass,                                  // FR-203
  priority: Priority,
  priorityReason: z.string().max(120),                   // FR-206
  preconditions: z.array(z.string()).default([]),
  steps: z.array(TestStep).min(1),
  expectedOutcome: z.string().min(5),
  source: z.enum(["agent", "prd", "intent", "critic_gap", "human"]).default("agent"),
  sourceRefs: z.array(z.string()).default([]),           // PRD section ids — FR-207
  /** Planned but deliberately not generated — destructive on a non-disposable target. */
  plannedNotGenerated: z.boolean().default(false),
  notGeneratedReason: z.string().nullable().default(null),   // FR-209
  version: z.number().int().positive().default(1),       // bumps on an accepted patch
});

export const TestPlan = z.object({
  id: Id,
  lapId: Id,
  capabilityId: Id,
  round: z.number().int().min(0).max(2),                 // 0 = first attempt — FR-305
  scenarios: z.array(Scenario).min(1),
  markdownPath: z.string(),                              // FR-202 — the human artefact
  createdAt: Iso,
});
```

> **Why the Markdown is a path, not a field.** `FR-202` requires a human-readable plan *and* canonical JSON, generated from one source. The JSON is the source; the Markdown is a rendering, written to disk and hashed as evidence. Storing both in the row invites them to drift apart — and the first time they disagree, nobody can tell which one the tests came from.

### 2.6 CoverageAssessment — the brief's hard MUST

```ts
// packages/core/schema/critique.ts
export const GapClass = z.enum([
  "MISSING_FLOW", "MISSING_EDGE_CASE", "MISSING_ERROR_STATE",   // the brief's three — FR-302
]);

export const Gap = z.object({
  id: Id,
  class: GapClass,
  title: z.string().max(120),
  why: z.string().max(400),
  severity: Severity,                    // BLOCKER blocks the transition — TG-5b
  suggestedScenario: z.string().max(400),
  affordanceRefs: z.array(z.string()).default([]),   // what evidence says it exists
});

export const CoverageAssessment = z.object({
  id: Id,
  lapId: Id,
  planId: Id,
  round: z.number().int().min(0).max(2),
  /** [0,1], reproducible from stored inputs. Algorithm in 11 §3. FR-303 */
  score: Confidence,
  floor: Confidence,                     // the threshold in force for this run
  structural: z.object({                 // the deterministic half — no model
    affordancesExercised: z.number().int(),
    affordancesTotal: z.number().int(),
    transitionsTraversed: z.number().int(),
    transitionsTotal: z.number().int(),
    statesReached: z.number().int(),
    statesTotal: z.number().int(),
    classesPresent: z.array(ScenarioClass),
  }),
  gaps: z.array(Gap),                                  // FR-302
  residualGaps: z.array(Gap).default([]),              // FR-306 — present even on a pass
  prdGaps: z.array(z.object({                          // FR-307 — the brief's Bonus B1
    requirement: z.string(), prdSectionRef: z.string(), severity: Severity,
  })).default([]),
  verdict: z.enum(["PASS", "REPLAN", "ACCEPT_RISK"]),
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),   // FR-308
  createdAt: Iso,
});
```

> **`residualGaps` on a passing assessment is the most honest field in the schema.** Passing the floor is not the same as being complete, and a tool that reports only what it covered is the tool this project exists to argue against ([01 §2.2](../01-foundation/01-vision-and-scope.md)).

### 2.7 Lap — where the counters live

```ts
export const LapStatus = z.enum([
  "LAP_PENDING", "PLANNING", "CRITIQUING", "GENERATING", "RUNNING",
  "TRIAGING", "DECIDING", "HEALING", "VERIFYING", "BANKED",
]);

export const LapOutcome = z.enum([
  "VERIFIED", "DEFECT_FOUND", "ESCALATED", "PARTIAL", "LAP_FAILED",
]);

export const Lap = z.object({
  id: Id,
  sessionId: Id,
  capabilityId: Id,
  index: z.number().int().nonnegative(),           // backlog position, 0-based
  status: LapStatus,
  outcome: LapOutcome.nullable(),
  replanRounds: z.number().int().min(0).max(2),                 // FR-305 · I-12
  healAttempts: z.record(z.string(), z.number().int()),         // stepId → attempts · FR-708
  acceptedRisk: z.array(Gap).default([]),
  specPath: z.string().nullable(),                 // the banked file — FR-405
  startedAt: Iso,
  bankedAt: Iso.nullable(),
});
```

### 2.8 Run, events and evidence

```ts
export const RunStatus = z.enum([
  "QUEUED", "RUNNING", "VERIFIED", "FAIL_WITH_EVIDENCE",
  "ESCALATED", "FLAKY", "ERROR",
]);

export const StepStatus = z.enum(["PASSED", "FAILED", "SKIPPED", "HEALED", "FLAKY"]);

export const Run = z.object({
  id: Id,
  lapId: Id,
  scenarioId: z.string(),
  status: RunStatus,
  attempt: z.number().int().min(0),                // 0 = initial, 1..2 = post-heal
  startedAt: Iso,
  finishedAt: Iso.nullable(),
  durationMs: z.number().int().nullable(),
  verification: z.object({
    healedStepRerun: z.boolean().default(false),
    fullFlowRerun: z.boolean().default(false),     // TG-10 · I-7
  }),
  diagnosisSource: z.enum(["deterministic", "llm", "llm+deterministic"]).nullable(),
});

export const SessionEventType = z.enum([
  "session.started", "explore.state", "explore.finished",
  "capabilities.ranked", "lap.started",
  "plan.drafted", "critique.finished", "critique.replan",
  "generate.validated", "generate.dropped",
  "run.started", "step.finished", "evidence.captured",
  "triage.finished", "heal.candidates", "heal.decided", "heal.patched",
  "heal.rolled_back", "verify.finished",
  "lap.banked", "report.generated", "session.finished",
]);

export const SessionEvent = z.object({
  id: Id,
  eventVersion: z.literal(1),
  seq: z.number().int().nonnegative(),             // monotonic, gapless, per session
  sessionId: Id,
  lapId: Id.nullable(),
  at: Iso,
  actor: z.enum([
    "orchestrator", "explorer", "planner", "critic", "generator",
    "runner", "triage", "healer", "reporter", "human",
  ]),
  type: SessionEventType,
  payload: z.record(z.unknown()),
  evidenceIds: z.array(Id).default([]),
  traceId: z.string(),
  spanId: z.string(),
  configSha256: z.string().length(64),
});

export const EvidenceType = z.enum([
  "SNAPSHOT",     // accessibility snapshot — the perception primitive
  "DOM", "SCREENSHOT", "CROP", "TRACE", "CONSOLE", "NETWORK",
  "DIFF", "PATCH",
  "TRANSCRIPT",   // a sub-agent loop transcript — ADR-011 §4, cost 3
  "PLAN", "REPORT",
]);

export const Evidence = z.object({
  id: Id,
  sessionId: Id,
  lapId: Id.nullable(),
  runId: Id.nullable(),
  stepId: z.string().nullable(),
  type: EvidenceType,
  path: z.string(),                                // relative to artifacts/
  sha256: z.string().length(64),
  bytes: z.number().int().nonnegative(),
  capturedAt: Iso,
  label: z.string(),                               // short human caption for the UI
  metadata: z.record(z.unknown()).default({}),
});
```

`heal.rolled_back` earns its place in the event enum: it is the only real-world signal that a heal was wrong, and it is the cheapest early warning in the project ([decisions/README](../decisions/README.md), ADR-001 A1).

**Event compatibility rule.** Event types are additive. A breaking payload change requires a new `eventVersion` and a temporary dual-publish path; an unknown event remains a displayable audit row, never a dashboard crash. Event payloads contain typed domain data and evidence references only: never credentials, cookies, authorization headers, raw prompts, full DOM dumps, or raw trace/HAR/network bodies.

### 2.9 Diagnosis, candidates, patches, fingerprints

Carried over from the pre-brief model, which the brief validated rather than invalidated. Two changes only.

```ts
export const DiagnosisKind = z.enum([
  "LOCATOR_BREAK", "CONTENT_DRIFT", "PRODUCT_BUG",   // was DESIGN_DRIFT — see §5
  "FLAKY", "ENVIRONMENT", "UNKNOWN",
]);

export const RecommendedAction = z.enum(["HEAL", "FAIL", "ESCALATE", "RETRY"]);

export const Diagnosis = z.object({
  id: Id,
  runId: Id,
  stepId: z.string(),
  kind: DiagnosisKind,
  confidence: Confidence,
  evidenceIds: z.array(Id).min(3),                 // FR-602 — must cite ≥ 3
  explanation: z.string().min(10).max(400),
  recommendedAction: RecommendedAction,
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),
  vetoes: z.array(z.string()).default([]),         // ["V2"]
  final: z.boolean().default(false),               // true ⇒ no model output may override
  /** Non-null for PRODUCT_BUG. All three fields required. FR-606 */
  defectReport: z.object({
    expected: z.string(), actual: z.string(), reproduction: z.array(z.string()).min(1),
  }).nullable().default(null),
  /** Set when this failure matched a previously diagnosed signature — no model call. */
  sameRootCauseAs: z.string().nullable().default(null),
  failureSignature: z.string().length(16),
});

export const HealSignals = z.object({
  semantic: Confidence, role: Confidence, text: Confidence,
  domContext: Confidence, visualGeometry: Confidence, historical: Confidence,
});

export const HealCandidate = z.object({
  id: Id, diagnosisId: Id, rank: z.number().int(),
  strategy: z.enum([
    "role_name", "label", "placeholder", "text", "test_id",
    "alt_title", "dom_relative", "css", "xpath", "geometry",
  ]),
  locator: z.string(),
  resolvedCount: z.number().int(),                 // must be exactly 1 to be eligible
  signals: HealSignals,
  score: Confidence,
  rationale: z.string().max(300),
  blockedBy: z.array(z.string()).default([]),      // veto IDs
});

export const TestPatch = z.object({
  id: Id, runId: Id, scenarioId: z.string(), stepId: z.string(),
  before: z.string(), after: z.string(),
  diff: z.string(),                                // unified diff — FR-709
  beforeFileSha256: z.string().length(64),         // enables byte-exact rollback — FR-710
  appliedAt: Iso, verifiedAt: Iso.nullable(), revertedAt: Iso.nullable(),
});

export const ElementFingerprint = z.object({
  id: Id, scenarioId: z.string(), stepId: z.string(),
  capturedInRunId: Id, capturedAt: Iso,
  intent: z.string(),
  role: z.string().nullable(), accessibleName: z.string().nullable(),
  text: z.string().nullable(), tagName: z.string(), testId: z.string().nullable(),
  attributes: z.record(z.string()),                // allowlist, see below
  ancestorPath: z.array(z.object({
    tag: z.string(), role: z.string().nullable(), id: z.string().nullable(),
  })),                                             // root → parent, max 6 deep
  siblingIndex: z.number().int(),
  bbox: BBox, viewport: Viewport,
  screenshotCropEvidenceId: Id.nullable(),
  computedStyle: z.object({
    color: z.string(), backgroundColor: z.string(),
    fontSize: z.string(), fontWeight: z.string(),
    display: z.string(), visibility: z.string(),
  }),
});
```

**Attribute allowlist** — capture only `type`, `name`, `placeholder`, `aria-label`, `aria-labelledby`, `title`, `alt`, `href`, `value`, `role`, `data-testid`, `data-test`, `data-qa`. Everything else is discarded at capture time, because framework hydration attributes change on every build and would make every fingerprint look stale.

`resolvedCount` still deserves the emphasis it had before the re-aim: a candidate resolving to 0 elements is dead, and one resolving to 2+ is **dangerous** — it would silently act on the wrong element. Only `resolvedCount === 1` is eligible, checked before scoring, not after (`I-5`).

### 2.10 QualityReport and RobustnessScore

The five fields the brief names are the five non-optional fields at the top. The formula behind the score belongs to [14 · Quality Report & Score](../03-algorithms/14-quality-report-and-score.md); only the shape is fixed here.

```ts
// packages/core/schema/report.ts
export const UntestedFlowRisk = z.object({
  capabilityId: Id,
  name: z.string(),
  why: z.string().max(300),
  riskScore: Confidence,
  factors: RiskFactors,                            // FR-804 — ranked, never alphabetical
});

export const QualityReport = z.object({
  id: Id,
  sessionId: Id,
  // ── the five contents clause M7 names, all required ──────────────────
  scenariosCovered: z.array(z.object({
    scenarioId: z.string(), capability: z.string(),
    title: z.string(), class: ScenarioClass, priority: Priority,
  })),
  outcomes: z.object({
    passed: z.number().int(), failed: z.number().int(),
    healed: z.number().int(), flaky: z.number().int(), skipped: z.number().int(),
  }),
  healerActions: z.array(z.object({
    runId: Id, stepId: z.string(), decision: z.enum(["HEALED", "BLOCKED", "ESCALATED"]),
    vetoId: z.string().nullable(), before: z.string(), after: z.string().nullable(),
    confidence: Confidence, verified: z.boolean(),
  })),
  coverageGapsRemaining: z.array(Gap),
  untestedFlowRisk: z.array(UntestedFlowRisk),
  // ── everything below is ours, not the brief's ────────────────────────
  defects: z.array(z.object({ diagnosisId: Id, capability: z.string(),
    expected: z.string(), actual: z.string(), severity: Severity })),
  score: z.lazy(() => RobustnessScore),
  hoursSaved: z.object({                           // FR-807
    estimate: z.number(), assumptions: z.array(z.string()).min(1),
  }).nullable(),
  generatedAt: Iso,
});

export const RobustnessScore = z.object({
  current: z.number().min(0).max(100),             // FR-802
  projected: z.number().min(0).max(100),           // FR-803 — "fix these and it scores 71"
  components: z.record(z.string(), z.number()),    // every term, so it can be re-added by hand
  perCapability: z.array(z.object({                // FR-806
    capabilityId: Id, name: z.string(), points: z.number(), lostBecause: z.array(z.string()),
  })),
  findings: z.array(z.object({
    findingId: Id, title: z.string(), pointsIfFixed: z.number(),
  })),
});
```

> **`hoursSaved` is nullable and carries its assumptions in the same object.** A business-impact number with its assumptions detached is a marketing claim; with them attached it is an estimate. `FR-807` says "stated with its assumptions visible" — the schema makes it impossible to render the number without them.

---

## 3. What was removed

| Entity | Disposition |
|---|---|
| `DesignContract`, `DesignElement`, `DesignRule` | **Removed.** Design intelligence is deferred ([ADR-013](../decisions/ADR-013-design-intelligence-deferred.md)); the shapes are preserved in [deferred/](../deferred/design-intelligence.md). |
| `DesignFinding` | **Removed.** Its evidence type `DESIGN` and DB table go with it. |
| `Target` | **Merged into `Session`.** The pre-brief model had a `Target` because a human supplied an intent per target; now the session *is* the target plus its inputs. |
| `TestSpec` | **Renamed to `Scenario`** and re-parented under `TestPlan`. |
| `RunEvent` | **Renamed to `SessionEvent`** and re-parented under `Session`, matching `NFR-4`'s `session_events` table. `seq` is now monotonic per session, so the timeline is one ordered stream across all laps. |

Nothing was deleted without a destination — the rule from [00 · Work Plan §6](../00-work-plan.md) applies to schemas as much as to documents.

---

## 4. SQLite DDL (`packages/store/migrations/001_init.sql`)

Replaces the pre-brief `001_init.sql` in full. No migration is needed because it has never been applied — the store package does not exist yet, which is exactly why this is the cheap moment to change it.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'autopilot',
  status TEXT NOT NULL, authenticated INTEGER NOT NULL DEFAULT 0,
  storage_state_path TEXT, exit_code INTEGER, defects_found INTEGER NOT NULL DEFAULT 0,
  input_json TEXT NOT NULL,          -- password stripped before write (I-16)
  usage_json TEXT, created_at TEXT NOT NULL, finished_at TEXT
);

-- APPEND ONLY. NFR-4. No UPDATE or DELETE may target this table.
CREATE TABLE session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL, lap_id TEXT, at TEXT NOT NULL,
  actor TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE states (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  signature TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
  auth_required INTEGER NOT NULL DEFAULT 0, snapshot_evidence_id TEXT NOT NULL,
  visited_variants INTEGER NOT NULL DEFAULT 1, discovered_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_state_sig ON states(session_id, signature);   -- FR-108

CREATE TABLE affordances (
  id TEXT PRIMARY KEY, state_id TEXT NOT NULL REFERENCES states(id),
  ref TEXT NOT NULL, role TEXT NOT NULL, accessible_name TEXT, kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, destructive INTEGER NOT NULL DEFAULT 0,
  observed_not_exercised INTEGER NOT NULL DEFAULT 0, not_exercised_reason TEXT,
  bbox_json TEXT
);
CREATE INDEX idx_aff_state ON affordances(state_id);

CREATE TABLE transitions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  from_state_id TEXT NOT NULL, to_state_id TEXT NOT NULL,
  via_affordance_id TEXT NOT NULL, action TEXT NOT NULL, observed_at TEXT NOT NULL
);
CREATE INDEX idx_tr_session ON transitions(session_id, from_state_id);

CREATE TABLE capabilities (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL, description TEXT NOT NULL, entry_state_id TEXT NOT NULL,
  risk_score REAL NOT NULL, priority_rank INTEGER NOT NULL, doc_json TEXT NOT NULL
);
CREATE INDEX idx_cap_rank ON capabilities(session_id, priority_rank);

CREATE TABLE laps (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  capability_id TEXT NOT NULL REFERENCES capabilities(id),
  idx INTEGER NOT NULL, status TEXT NOT NULL, outcome TEXT,
  replan_rounds INTEGER NOT NULL DEFAULT 0 CHECK (replan_rounds <= 2),   -- I-12
  heal_attempts_json TEXT NOT NULL DEFAULT '{}',
  accepted_risk_json TEXT NOT NULL DEFAULT '[]',
  spec_path TEXT, started_at TEXT NOT NULL, banked_at TEXT
);
CREATE INDEX idx_lap_session ON laps(session_id, idx);

CREATE TABLE test_plans (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  capability_id TEXT NOT NULL, round INTEGER NOT NULL,
  markdown_path TEXT NOT NULL, doc_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_plan_round ON test_plans(lap_id, round);   -- rounds are kept, not overwritten

CREATE TABLE coverage_assessments (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  plan_id TEXT NOT NULL REFERENCES test_plans(id), round INTEGER NOT NULL,
  score REAL NOT NULL, floor REAL NOT NULL, verdict TEXT NOT NULL,
  source TEXT NOT NULL, doc_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_assess_plan ON coverage_assessments(plan_id);   -- 1:1 with a plan · I-11

CREATE TABLE runs (
  id TEXT PRIMARY KEY, lap_id TEXT NOT NULL REFERENCES laps(id),
  scenario_id TEXT NOT NULL, status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, finished_at TEXT, duration_ms INTEGER,
  diagnosis_source TEXT, verification_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_runs_lap ON runs(lap_id, started_at DESC);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  lap_id TEXT, run_id TEXT, step_id TEXT, type TEXT NOT NULL,
  path TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
  label TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL
);
CREATE INDEX idx_ev_run ON evidence(run_id, step_id);
CREATE UNIQUE INDEX idx_ev_content ON evidence(session_id, sha256, type);

CREATE TABLE fingerprints (
  id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL, step_id TEXT NOT NULL,
  captured_in_run_id TEXT NOT NULL, doc_json TEXT NOT NULL, captured_at TEXT NOT NULL
);
CREATE INDEX idx_fp_step ON fingerprints(scenario_id, step_id, captured_at DESC);

CREATE TABLE diagnoses (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  step_id TEXT NOT NULL, kind TEXT NOT NULL, confidence REAL NOT NULL,
  explanation TEXT NOT NULL, recommended_action TEXT NOT NULL, source TEXT NOT NULL,
  vetoes_json TEXT NOT NULL DEFAULT '[]', final INTEGER NOT NULL DEFAULT 0,
  evidence_ids_json TEXT NOT NULL, defect_report_json TEXT,
  failure_signature TEXT NOT NULL, same_root_cause_as TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_diag_sig ON diagnoses(failure_signature);   -- the repeat-failure cache

CREATE TABLE heal_candidates (
  id TEXT PRIMARY KEY, diagnosis_id TEXT NOT NULL REFERENCES diagnoses(id),
  rank INTEGER NOT NULL, strategy TEXT NOT NULL, locator TEXT NOT NULL,
  resolved_count INTEGER NOT NULL, signals_json TEXT NOT NULL,
  score REAL NOT NULL, rationale TEXT NOT NULL,
  blocked_by_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE patches (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  scenario_id TEXT NOT NULL, step_id TEXT NOT NULL,
  before_locator TEXT NOT NULL, after_locator TEXT NOT NULL, diff TEXT NOT NULL,
  before_file_sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL, verified_at TEXT, reverted_at TEXT
);

CREATE TABLE quality_reports (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
  score_current REAL NOT NULL, score_projected REAL NOT NULL,
  doc_json TEXT NOT NULL, generated_at TEXT NOT NULL
);
```

### Why JSON columns alongside relational ones

`doc_json` holds the full validated document; the extracted columns exist only for indexing and querying. This buys schema evolution during a short build (add a Zod field, no migration) while keeping the dashboard's queries fast. The rule: **never read a value from a JSON column that also exists as a real column** — the column is authoritative for queries, the JSON for reconstruction.

---

## 5. Invariants — assert in code, one test each

`I-1` … `I-10` are carried over from the pre-brief model; where an entity was renamed, the invariant kept its number and changed its subject ([00 · Work Plan §5](../00-work-plan.md): IDs are permanent).

| # | Invariant | Enforced in | Test |
|---|---|---|---|
| `I-1` | `session_events` is append-only; `seq` is gapless per session | `store.appendEvent()` | `store/events.test.ts` |
| `I-2` | An evidence path always contains its own sha256 prefix, and `putEvidence()` compares the **full** hash on a prefix hit | `store.putEvidence()` | `store/evidence.test.ts` |
| `I-3` | A step whose `kind ∈ ASSERTION_KINDS` never receives a patch | `healing.guard()` | `healing/veto.test.ts` |
| `I-4` | `healAttempts ≤ 2` per step and `≤ 3` per lap | orchestrator FSM | `orchestrator/limits.test.ts` |
| `I-5` | Only `resolvedCount === 1` candidates are eligible for scoring | `healing.filterEligible()` | `healing/candidates.test.ts` |
| `I-6` | A `Diagnosis` with a fired veto has `final = true` | `diagnose.preClassify()` | `diagnose/preclass.test.ts` |
| `I-7` | `Run.status = VERIFIED` requires `verification.fullFlowRerun = true` | `TG-10` | `orchestrator/verify.test.ts` |
| `I-8` | Every `evidenceId` cited in a diagnosis resolves to a stored row | `store.resolveEvidence()` | `orchestrator/triage.test.ts` |
| `I-9` | Writes stay inside the allowlist; traversal escapes are rejected | `store.safeWrite()` | `store/paths.test.ts` |
| `I-10` | `Scenario.version` increments on every accepted patch | `healing.applyPatch()` | `healing/patch.test.ts` |
| `I-11` | **No lap enters `GENERATING` without a `CoverageAssessment` for its current plan** | `TG-5b` + a unique index | `orchestrator/guards.test.ts` |
| `I-12` | `Lap.replanRounds ≤ 2`, enforced by the FSM **and** a `CHECK` constraint | `TG-6`, DDL | `orchestrator/replan.test.ts` |
| `I-13` | Every `TestStep.stateId` and `affordanceRef` resolves in the `CapabilityMap` | `plan.validate()` | `schema/grounding.test.ts` |
| `I-14` | A re-plan preserves `scenarioId` for scenarios whose steps are unchanged | `planner.merge()` | `agents/planner.test.ts` |
| `I-15` | A session ends in exactly one terminal status; every lap ends `BANKED` with exactly one outcome | orchestrator FSM | `orchestrator/terminal.test.ts` |
| `I-16` | No credential literal appears in any evidence row, event payload, stored session, or generated file | `store.putEvidence()`, `redact()` | `store/redaction.test.ts` |
| `I-17` | `priorityRank` is a pure function of the `CapabilityMap` — the same map yields the same order | `prioritise()` | `orchestrator/ranking.test.ts` |
| `I-18` | A `QualityReport` has all five brief-mandated fields populated | `QualityReportSchema` | `report/contents.test.ts` |
| `I-19` | `RobustnessScore.current` recomputes exactly from stored inputs | `report.score()` | `report/score.test.ts` |
| `I-20` | Every affordance with `destructive = true` also has `observedNotExercised = true` | `explorer.denyList()` | `perception/denylist.test.ts` |
| `I-21` | A session's stored configuration digest equals the canonical snapshot and never changes after creation | `store.createSession()` | `store/session-config.test.ts` |

`I-13` and `I-17` are the two that would otherwise be discovered late and painfully: the first is the only thing standing between a plan and a hallucinated button, and the second is what the promise *"the first lap is the most valuable"* actually rests on (ADR-012 A3).

---

## 6. ID conventions

| Prefix | Entity | Example |
|---|---|---|
| `ses_` | Session | `ses_01j9x2k4` |
| `st_` | State | `st_01j9x2k5` |
| `af_` | Affordance | `af_01j9x2k6` |
| `tr_` | Transition | `tr_01j9x2k7` |
| `cap_` | Capability | `cap_01j9x2k8` |
| `lap_` | Lap | `lap_01j9x2k9` |
| `pln_` | TestPlan | `pln_01j9x3a0` |
| `SC-nnn` | Scenario (session-scoped, human-facing, **stable**) | `SC-014` |
| `s<n>` | TestStep (scenario-local) | `s4` |
| `cva_` | CoverageAssessment | `cva_01j9x3a1` |
| `gap_` | Gap | `gap_01j9x3a2` |
| `run_` | Run | `run_01j9x3aa` |
| `ev_` | Evidence | `ev_01j9x3ab` |
| `fp_` | ElementFingerprint | `fp_01j9x3ac` |
| `dg_` | Diagnosis | `dg_01j9x3ad` |
| `hc_` | HealCandidate | `hc_01j9x3ae` |
| `pt_` | TestPatch | `pt_01j9x3af` |
| `qr_` | QualityReport | `qr_01j9x3ag` |

IDs are ULID-based, so they sort lexicographically by creation time. `Scenario` is the deliberate exception: `SC-014` appears in a test title, a plan document, a report row and a judge's field of view, so it is short, sequential and human-quotable — and stable across re-planning (`FR-205`, `I-14`).

---

## 7. Migration from the pre-brief model

| Pre-brief | Disposition | Now |
|---|---|---|
| `Target` | Merged | `Session` |
| `TestSpec` | Renamed, re-parented | `Scenario` under `TestPlan` |
| `TestStep` | Retained, **extended** with `stateId`, `affordanceRef`, `resolvedCount` | `TestStep` |
| `Run` | Retained, re-parented under `Lap`, scoped to one scenario | `Run` |
| `RunEvent` | Renamed, re-parented, `seq` now session-scoped | `SessionEvent` |
| `Evidence` | Retained; `DESIGN` type dropped, `SNAPSHOT` and `TRANSCRIPT` added | `Evidence` |
| `Diagnosis` | Retained; `DESIGN_DRIFT` → `CONTENT_DRIFT`; `defectReport`, `failureSignature` added | `Diagnosis` |
| `HealCandidate`, `TestPatch` | Retained; `beforeFileSha256` added for byte-exact rollback | unchanged names |
| `ElementFingerprint` | Retained; re-keyed from `testSpecId` to `scenarioId` | `ElementFingerprint` |
| `DesignContract`, `DesignElement`, `DesignRule`, `DesignFinding` | Removed | [deferred/](../deferred/design-intelligence.md) |
| — | New | `Affordance`, `State`, `Transition`, `CapabilityMap`, `Capability`, `Lap`, `TestPlan`, `CoverageAssessment`, `Gap`, `QualityReport`, `RobustnessScore` |

**The one semantic change to argue about:** `DESIGN_DRIFT` becomes `CONTENT_DRIFT` (`FR-601`). The old name presumed a design contract we no longer maintain. The new one covers what actually happens on an arbitrary application — a button's copy changed, a currency symbol moved, a label was reworded — which is a real and common cause that must never be confused with a locator break, and must never be silently healed.

---

## 8. Related documents

- The states these entities are written in → [04 · System Architecture §3](04-system-architecture.md)
- Who produces each of them → [06 · Agent Contracts](06-agent-contracts.md)
- Where `State`, `Affordance` and `signature` come from → [08 · Perception Layer](08-perception-layer.md)
- The coverage score behind `CoverageAssessment.score` → [11 · Coverage Critic](../03-algorithms/11-coverage-critic.md)
- The formula behind `RobustnessScore` → [14 · Quality Report & Score](../03-algorithms/14-quality-report-and-score.md)
