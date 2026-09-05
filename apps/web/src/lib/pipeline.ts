import type { SessionEvent, SessionStatus } from "./api";

export type StepStatus = "pending" | "active" | "done" | "error" | "skipped";

export type PipelineStep = {
  id: string;
  label: string;
  detail: string;
  status: StepStatus;
  at: string | null;
  eventType: string | null;
};

type StageDef = {
  id: string;
  label: string;
  detail: string;
  /** Events that mark this stage complete. */
  completeOn: string[];
};

const STAGES: StageDef[] = [
  {
    id: "start",
    label: "Start session",
    detail: "Accept and validate the application URL",
    completeOn: ["session.started"],
  },
  {
    id: "explore",
    label: "Explore",
    detail: "Crawl states, transitions, and affordances",
    completeOn: ["explore.finished"],
  },
  {
    id: "prioritise",
    label: "Prioritise",
    detail: "Rank capabilities by risk",
    completeOn: ["capabilities.ranked"],
  },
  {
    id: "plan",
    label: "Plan",
    detail: "Draft scenarios for the highest-risk capability",
    completeOn: ["plan.drafted"],
  },
  {
    id: "critique",
    label: "Critique",
    detail: "Score coverage and send weak plans back",
    completeOn: ["critique.finished", "critique.replan"],
  },
  {
    id: "generate",
    label: "Generate",
    detail: "Compile grounded Playwright scenarios",
    completeOn: ["generate.validated", "run.started"],
  },
  {
    id: "run",
    label: "Run",
    detail: "Execute the suite and capture evidence",
    completeOn: ["lap.banked", "step.finished"],
  },
  {
    id: "heal",
    label: "Triage & heal",
    detail: "Diagnose failures; heal or refuse with evidence",
    completeOn: ["heal.decided", "verify.finished"],
  },
  {
    id: "report",
    label: "Report",
    detail: "Compute RobustnessScore and emit the quality report",
    completeOn: ["report.generated"],
  },
  {
    id: "finish",
    label: "Complete",
    detail: "Session finished — open the full report",
    completeOn: ["session.finished"],
  },
];

/** How many stages are complete for a given session status (fallback when events lag). */
const STATUS_COMPLETED: Record<SessionStatus, number> = {
  CREATED: 0,
  EXPLORING: 1,
  PRIORITISING: 2,
  LAPPING: 3,
  REPORTING: 8,
  COMPLETED: 10,
  COMPLETED_PARTIAL: 10,
  ESCALATED: 10,
  ERROR: 10,
};

/** Lap FSM payload → stages completed (exclusive of the active one). */
const LAP_COMPLETED: Record<string, number> = {
  PLANNING: 3,
  CRITIQUING: 4,
  GENERATING: 5,
  RUNNING: 6,
  TRIAGING: 7,
  DECIDING: 7,
  HEALING: 7,
  VERIFYING: 7,
  BANKED: 8,
};

function firstEventAt(events: SessionEvent[], types: string[]): string | null {
  const hit = events.find((e) => types.includes(e.type));
  return hit?.at ?? null;
}

function lastEventType(events: SessionEvent[], types: string[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (types.includes(events[i]!.type)) return events[i]!.type;
  }
  return null;
}

function completedFromEvents(events: SessionEvent[]): number {
  let n = 0;
  for (const stage of STAGES) {
    if (events.some((e) => stage.completeOn.includes(e.type))) {
      n += 1;
    } else if (stage.id === "heal") {
      // Stub banks without triage — treat heal as satisfied once the lap is banked.
      if (events.some((e) => e.type === "lap.banked")) n += 1;
      else break;
    } else {
      break;
    }
  }

  for (const event of events) {
    const lapStatus = event.payload.status;
    if (typeof lapStatus === "string" && lapStatus in LAP_COMPLETED) {
      n = Math.max(n, LAP_COMPLETED[lapStatus]!);
    }
  }
  return n;
}

/**
 * Derive the ten pipeline rows from session status + persisted events.
 * Live and finished sessions share this reducer.
 */
export function buildPipeline(status: SessionStatus, events: SessionEvent[]): PipelineStep[] {
  const healEvents = events.some((e) =>
    ["triage.finished", "heal.candidates", "heal.decided", "verify.finished"].includes(e.type),
  );

  let completed = Math.max(STATUS_COMPLETED[status] ?? 0, completedFromEvents(events));

  // If we banked without heal events, count heal as completed (will render skipped).
  if (completed >= 8 && !healEvents) {
    // run complete (index 6) + heal skipped (7) already implied by BANKED→8
  }

  if (status === "COMPLETED" || status === "COMPLETED_PARTIAL") {
    completed = STAGES.length;
  }

  const terminal =
    status === "COMPLETED" || status === "COMPLETED_PARTIAL" || status === "ESCALATED";
  const errored = status === "ERROR";

  return STAGES.map((stage, index) => {
    let stepStatus: StepStatus = "pending";

    if (index < completed) {
      stepStatus = "done";
    } else if (index === completed && !terminal && !errored) {
      stepStatus = "active";
    } else if (index === completed && errored) {
      stepStatus = "error";
    } else if (terminal && index < STAGES.length) {
      stepStatus = index < completed ? "done" : "pending";
    }

    if (stage.id === "heal" && stepStatus === "done" && !healEvents) {
      stepStatus = "skipped";
    }

    const detail =
      stepStatus === "skipped" && stage.id === "heal"
        ? "No failures to triage — suite banked clean"
        : stage.detail;

    return {
      id: stage.id,
      label: stage.label,
      detail,
      status: stepStatus,
      at: firstEventAt(events, stage.completeOn),
      eventType: lastEventType(events, stage.completeOn),
    };
  });
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case "CREATED":
      return "Ready";
    case "EXPLORING":
      return "Exploring";
    case "PRIORITISING":
      return "Prioritising";
    case "LAPPING":
      return "Lapping";
    case "REPORTING":
      return "Reporting";
    case "COMPLETED":
      return "Completed";
    case "COMPLETED_PARTIAL":
      return "Partial";
    case "ESCALATED":
      return "Needs review";
    case "ERROR":
      return "Error";
    default:
      return status;
  }
}
