import type { Lap, LapStatus, SessionStatus } from "@forge/core";

export class IllegalTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

type Persist<State extends string> = (next: State) => void;
type Emit<State extends string> = (previous: State, next: State) => void;

class PersistedMachine<State extends string> {
  constructor(
    private current: State,
    private readonly allowed: ReadonlyMap<State, ReadonlySet<State>>,
    private readonly persist: Persist<State>,
    private readonly emit: Emit<State>,
  ) {}

  get state(): State {
    return this.current;
  }

  transition(next: State): void {
    const previous = this.current;
    if (!this.allowed.get(previous)?.has(next)) {
      throw new IllegalTransitionError(previous, next);
    }
    this.persist(next);
    this.current = next;
    this.emit(previous, next);
  }
}

const SESSION_TRANSITIONS = new Map<SessionStatus, ReadonlySet<SessionStatus>>([
  ["CREATED", new Set(["EXPLORING", "ERROR"])],
  ["EXPLORING", new Set(["PRIORITISING", "ERROR"])],
  ["PRIORITISING", new Set(["LAPPING", "ERROR"])],
  ["LAPPING", new Set(["REPORTING", "ERROR"])],
  ["REPORTING", new Set(["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"])],
  ["COMPLETED", new Set()],
  ["COMPLETED_PARTIAL", new Set()],
  ["ESCALATED", new Set()],
  ["ERROR", new Set()],
]);

const LAP_TRANSITIONS = new Map<LapStatus, ReadonlySet<LapStatus>>([
  ["LAP_PENDING", new Set(["PLANNING", "BANKED"])],
  ["PLANNING", new Set(["CRITIQUING", "BANKED"])],
  ["CRITIQUING", new Set(["PLANNING", "GENERATING", "BANKED"])],
  ["GENERATING", new Set(["RUNNING", "BANKED"])],
  ["RUNNING", new Set(["TRIAGING", "BANKED"])],
  ["TRIAGING", new Set(["DECIDING", "BANKED"])],
  ["DECIDING", new Set(["HEALING", "BANKED"])],
  ["HEALING", new Set(["VERIFYING", "BANKED"])],
  ["VERIFYING", new Set(["BANKED"])],
  ["BANKED", new Set()],
]);

export class SessionMachine extends PersistedMachine<SessionStatus> {
  constructor(initial: SessionStatus, persist: Persist<SessionStatus>, emit: Emit<SessionStatus>) {
    super(initial, SESSION_TRANSITIONS, persist, emit);
  }
}

export class LapMachine extends PersistedMachine<LapStatus> {
  constructor(initial: LapStatus, persist: Persist<LapStatus>, emit: Emit<LapStatus>) {
    super(initial, LAP_TRANSITIONS, persist, emit);
  }
}

const TERMINAL_SESSION_STATUSES = new Set<SessionStatus>([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);

export function assertTerminalIntegrity(status: SessionStatus, laps: readonly Lap[]): void {
  if (!TERMINAL_SESSION_STATUSES.has(status)) {
    throw new Error(`Session status is not terminal: ${status}`);
  }
  const incomplete = laps.find(({ status: lapStatus, outcome }) => {
    return lapStatus !== "BANKED" || outcome === null;
  });
  if (incomplete !== undefined) {
    throw new Error(`Lap is not banked with one outcome: ${incomplete.id}`);
  }
}
