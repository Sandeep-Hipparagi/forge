import { z } from "zod";
import { BBox, Confidence, Id, Iso, Viewport } from "./primitives.js";

export const DiagnosisKind = z.enum([
  "LOCATOR_BREAK",
  "CONTENT_DRIFT",
  "PRODUCT_BUG",
  "FLAKY",
  "ENVIRONMENT",
  "UNKNOWN",
]);

export const RecommendedAction = z.enum(["HEAL", "FAIL", "ESCALATE", "RETRY"]);

export const Diagnosis = z.object({
  id: Id,
  runId: Id,
  stepId: z.string(),
  kind: DiagnosisKind,
  confidence: Confidence,
  evidenceIds: z.array(Id).min(3),
  explanation: z.string().min(10).max(400),
  recommendedAction: RecommendedAction,
  source: z.enum(["deterministic", "llm", "llm+deterministic"]),
  vetoes: z.array(z.string()).default([]),
  final: z.boolean().default(false),
  defectReport: z
    .object({
      expected: z.string(),
      actual: z.string(),
      reproduction: z.array(z.string()).min(1),
    })
    .nullable()
    .default(null),
  sameRootCauseAs: z.string().nullable().default(null),
  failureSignature: z.string().length(16),
});

export const HealSignals = z.object({
  semantic: Confidence,
  role: Confidence,
  text: Confidence,
  domContext: Confidence,
  visualGeometry: Confidence,
  historical: Confidence,
});

export const HealCandidate = z.object({
  id: Id,
  diagnosisId: Id,
  rank: z.number().int().nonnegative(),
  strategy: z.enum([
    "role_name",
    "label",
    "placeholder",
    "text",
    "test_id",
    "alt_title",
    "dom_relative",
    "css",
    "xpath",
    "geometry",
  ]),
  locator: z.string(),
  resolvedCount: z.number().int().nonnegative(),
  signals: HealSignals,
  score: Confidence,
  rationale: z.string().max(300),
  blockedBy: z.array(z.string()).default([]),
});

export const TestPatch = z.object({
  id: Id,
  runId: Id,
  scenarioId: z.string(),
  stepId: z.string(),
  before: z.string(),
  after: z.string(),
  diff: z.string(),
  beforeFileSha256: z.string().length(64),
  appliedAt: Iso,
  verifiedAt: Iso.nullable(),
  revertedAt: Iso.nullable(),
});

export const ElementFingerprint = z.object({
  id: Id,
  scenarioId: z.string(),
  stepId: z.string(),
  capturedInRunId: Id,
  capturedAt: Iso,
  intent: z.string(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  text: z.string().nullable(),
  tagName: z.string(),
  testId: z.string().nullable(),
  attributes: z.record(z.string()),
  ancestorPath: z
    .array(
      z.object({
        tag: z.string(),
        role: z.string().nullable(),
        id: z.string().nullable(),
      }),
    )
    .max(6),
  siblingIndex: z.number().int().nonnegative(),
  bbox: BBox,
  viewport: Viewport,
  screenshotCropEvidenceId: Id.nullable(),
  computedStyle: z.object({
    color: z.string(),
    backgroundColor: z.string(),
    fontSize: z.string(),
    fontWeight: z.string(),
    display: z.string(),
    visibility: z.string(),
  }),
});

export type DiagnosisKind = z.infer<typeof DiagnosisKind>;
export type Diagnosis = z.infer<typeof Diagnosis>;
export type HealCandidate = z.infer<typeof HealCandidate>;
export type TestPatch = z.infer<typeof TestPatch>;
export type ElementFingerprint = z.infer<typeof ElementFingerprint>;
