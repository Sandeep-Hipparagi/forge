import { describe, expect, it } from "vitest";
import { buildPipeline } from "./pipeline";
import type { SessionEvent } from "./api";

function event(partial: Partial<SessionEvent> & Pick<SessionEvent, "type" | "seq">): SessionEvent {
  return {
    sessionId: "ses_test",
    lapId: null,
    at: "2026-01-01T00:00:00.000Z",
    actor: "orchestrator",
    payload: {},
    ...partial,
  };
}

describe("buildPipeline", () => {
  it("marks start active on a fresh session", () => {
    const steps = buildPipeline("CREATED", []);
    expect(steps[0]?.status).toBe("active");
    expect(steps.every((s, i) => (i === 0 ? s.status === "active" : s.status === "pending"))).toBe(
      true,
    );
  });

  it("walks the stub event sequence through to complete", () => {
    const events: SessionEvent[] = [
      event({ seq: 0, type: "session.started", payload: { status: "EXPLORING" } }),
      event({ seq: 1, type: "explore.finished", payload: { status: "PRIORITISING" } }),
      event({ seq: 2, type: "capabilities.ranked", payload: { status: "LAPPING" } }),
      event({
        seq: 3,
        type: "lap.started",
        lapId: "lap_1",
        payload: { status: "PLANNING" },
      }),
      event({
        seq: 4,
        type: "plan.drafted",
        lapId: "lap_1",
        payload: { status: "CRITIQUING" },
      }),
      event({
        seq: 5,
        type: "critique.finished",
        lapId: "lap_1",
        payload: { status: "GENERATING" },
      }),
      event({
        seq: 6,
        type: "run.started",
        lapId: "lap_1",
        payload: { status: "RUNNING" },
      }),
      event({
        seq: 7,
        type: "lap.banked",
        lapId: "lap_1",
        payload: { status: "BANKED", outcome: "VERIFIED" },
      }),
      event({ seq: 8, type: "report.generated", payload: { status: "REPORTING" } }),
      event({ seq: 9, type: "session.finished", payload: { status: "COMPLETED" } }),
    ];

    const steps = buildPipeline("COMPLETED", events);
    expect(steps.map((s) => s.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "skipped",
      "done",
      "done",
    ]);
  });
});
