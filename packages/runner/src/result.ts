/**
 * Local ToolResult mirror of the harness type.
 * Runner cannot import `@forge/agent-harness` (15 §2.2), so the shape lives here
 * and stays structurally identical.
 */
export type ToolErrorCode =
  | "LOCATOR_NOT_FOUND"
  | "LOCATOR_AMBIGUOUS"
  | "ASSERTION_FAILED"
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "TARGET_UNREACHABLE"
  | "ELEMENT_NOT_INTERACTABLE"
  | "ACTION_DENIED"
  | "OFF_ORIGIN"
  | "BUDGET_EXHAUSTED"
  | "SCRIPT_ERROR"
  | "INTERNAL";

export type ToolError = {
  code: ToolErrorCode;
  message: string;
  detail?: Record<string, unknown>;
};

export type ToolResult<T> =
  | { ok: true; data: T; evidenceIds: string[]; durationMs: number }
  | { ok: false; error: ToolError; evidenceIds: string[]; durationMs: number };

export function ok<T>(data: T, durationMs: number, evidenceIds: string[] = []): ToolResult<T> {
  return { ok: true, data, evidenceIds, durationMs };
}

export function fail<T>(
  code: ToolErrorCode,
  message: string,
  durationMs: number,
  detail?: Record<string, unknown>,
): ToolResult<T> {
  return {
    ok: false,
    error: detail === undefined ? { code, message } : { code, message, detail },
    evidenceIds: [],
    durationMs,
  };
}
