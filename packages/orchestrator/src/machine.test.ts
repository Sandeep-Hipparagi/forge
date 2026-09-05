import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capability, Lap, RunContext } from "@forge/core";
import { ForgeStore } from "@forge/store";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertTerminalIntegrity,
  IllegalTransitionError,
  LapMachine,
  SessionMachine,
} from "./machine.js";
import { nextCapability, runLapSchedule } from "./scheduler.js";

function context(): RunContext {
  let sequence = 0;
  return {
    clock: {
      now: () => new globalThis.Date("2026-01-01T00:00:00.000Z"),
      monotonicMs: () => sequence,
    },
    rng: { next: () => 0.5 },
    ids: {
      next: (prefix) => `${prefix}_${(sequence++).toString(36).padStart(8, "0")}`,
    },
  };
}

const capability = (id: string, priorityRank: number, dependsOn: string[] = []): Capability => ({
  id,
  sessionId: "ses_00000000",
  name: `Capability ${id}`,
  description: "A capability used by the deterministic scheduler",
  entryStateId: "st_00000000",
  stateIds: ["st_00000000"],
  exitConditions: ["Done"],
  dependsOn,
  risk: {
    score: 0.5,
    factors: {
      authProximity: 0,
      dataMutation: 0,
      moneyOrPii: 0,
      graphCentrality: 0,
      affordanceDensity: 0,
      statedIntent: 0,
    },
  },
  priorityRank,
});

const lap = (capabilityId: string, status: Lap["status"], outcome: Lap["outcome"]): Lap => ({
  id: `lap_${capabilityId.slice(-8)}`,
  sessionId: "ses_00000000",
  capabilityId,
  index: 0,
  status,
  outcome,
  replanRounds: 0,
  healAttempts: {},
  acceptedRisk: [],
  specPath: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  bankedAt: status === "BANKED" ? "2026-01-01T00:01:00.000Z" : null,
});

describe("persisted machines", () => {
  let directory: string | undefined;
  let store: ForgeStore | undefined;

  afterEach(async () => {
    store?.close();
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists a transition before emitting and resumes that state after interruption", async () => {
    directory = await mkdtemp(join(tmpdir(), "forge-machine-"));
    store = new ForgeStore({
      databasePath: join(directory, "forge.db"),
      repositoryRoot: directory,
      context: context(),
    });
    const session = store.createSession({
      url: "https://shop.test/",
      mode: "autopilot",
      budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
    });
    const interrupted = new SessionMachine(
      session.status,
      (next) => {
        store!.commitSessionTransition(
          session.id,
          { status: next },
          {
            sessionId: session.id,
            lapId: null,
            actor: "orchestrator",
            type: "session.started",
            payload: { status: next },
          },
        );
      },
      () => {
        throw new Error("simulated process interruption");
      },
    );

    expect(() => interrupted.transition("EXPLORING")).toThrow("interruption");
    expect(store.getSession(session.id)?.status).toBe("EXPLORING");
    expect(store.listEvents(session.id)).toHaveLength(1);

    const resumed = new SessionMachine(
      store.getSession(session.id)!.status,
      (next) =>
        void store!.commitSessionTransition(
          session.id,
          { status: next },
          {
            sessionId: session.id,
            lapId: null,
            actor: "orchestrator",
            type: "explore.finished",
            payload: { status: next },
          },
        ),
      () => undefined,
    );
    resumed.transition("PRIORITISING");
    expect(store.getSession(session.id)?.status).toBe("PRIORITISING");
    expect(store.listEvents(session.id).map(({ seq }) => seq)).toEqual([0, 1]);
  });

  it("throws on illegal transitions and locks terminal machines", () => {
    const machine = new SessionMachine(
      "CREATED",
      () => undefined,
      () => undefined,
    );
    expect(() => machine.transition("LAPPING")).toThrow(IllegalTransitionError);

    const terminal = new SessionMachine(
      "COMPLETED",
      () => undefined,
      () => undefined,
    );
    expect(() => terminal.transition("ERROR")).toThrow(IllegalTransitionError);
  });

  it("banks the lap as one persisted terminal transition", () => {
    let persisted: Lap["status"] = "RUNNING";
    const states: Lap["status"][] = [];
    const machine = new LapMachine(
      "RUNNING",
      (next) => {
        persisted = next;
      },
      (_previous, next) => states.push(next),
    );
    machine.transition("BANKED");
    expect(persisted).toBe("BANKED");
    expect(states).toEqual(["BANKED"]);
  });
});

describe("scheduler and terminal integrity", () => {
  it("schedules deterministically and waits for dependencies", () => {
    const signIn = capability("cap_00000001", 1);
    const editor = capability("cap_00000002", 0, [signIn.id]);
    expect(nextCapability([editor, signIn], [])?.id).toBe(signIn.id);
    expect(nextCapability([editor, signIn], [lap(signIn.id, "BANKED", "VERIFIED")])?.id).toBe(
      editor.id,
    );
  });

  it("requires every terminal session lap to be banked with one outcome", () => {
    const complete = lap("cap_00000001", "BANKED", "VERIFIED");
    expect(() => assertTerminalIntegrity("COMPLETED", [complete])).not.toThrow();
    expect(() =>
      assertTerminalIntegrity("COMPLETED", [lap("cap_00000001", "BANKED", null)]),
    ).toThrow("not banked");
    expect(() => assertTerminalIntegrity("REPORTING", [complete])).toThrow("not terminal");
  });

  it("banks a failed middle lap and continues later capabilities", async () => {
    const capabilities = [
      capability("cap_00000001", 0),
      capability("cap_00000002", 1),
      capability("cap_00000003", 2),
    ];
    const attempted: string[] = [];
    const laps = await runLapSchedule(
      capabilities,
      [],
      async (current) => {
        attempted.push(current.id);
        if (current.id === "cap_00000002") throw new Error("isolated failure");
        return lap(current.id, "BANKED", "VERIFIED");
      },
      async (current) => lap(current.id, "BANKED", "LAP_FAILED"),
    );
    expect(attempted).toEqual(capabilities.map(({ id }) => id));
    expect(laps.map(({ outcome }) => outcome)).toEqual(["VERIFIED", "LAP_FAILED", "VERIFIED"]);
  });
});
