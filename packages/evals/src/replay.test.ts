import { describe, expect, it } from "vitest";
import { deriveReplayKey, ReplayToolset } from "./replay.js";

describe("replay key derivation", () => {
  it("is canonical across object key order and fixed float precision", () => {
    const left = deriveReplayKey({
      caseId: "EC-01",
      toolOrAgent: "snapshot",
      args: { b: 2, a: 1.12345649 },
      stateSignature: "0123456789abcdef",
      callIndex: 0,
    });
    const right = deriveReplayKey({
      caseId: "EC-01",
      toolOrAgent: "snapshot",
      args: { a: 1.1234564, b: 2 },
      stateSignature: "0123456789abcdef",
      callIndex: 0,
    });
    expect(left).toBe(right);
  });

  it("distinguishes the second identical snapshot and a different state", () => {
    const base = {
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "0123456789abcdef",
    };
    expect(deriveReplayKey({ ...base, callIndex: 0 })).not.toBe(
      deriveReplayKey({ ...base, callIndex: 1 }),
    );
    expect(deriveReplayKey({ ...base, callIndex: 0 })).not.toBe(
      deriveReplayKey({
        ...base,
        stateSignature: "fedcba9876543210",
        callIndex: 0,
      }),
    );
  });

  it("replays identical calls in recorded order", async () => {
    const firstKey = deriveReplayKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "0123456789abcdef",
      callIndex: 0,
    });
    const secondKey = deriveReplayKey({
      caseId: "EC-05",
      toolOrAgent: "snapshot",
      args: {},
      stateSignature: "0123456789abcdef",
      callIndex: 1,
    });
    const replay = new ReplayToolset(
      "EC-05",
      new Map([
        [
          firstKey,
          {
            key: firstKey,
            result: { ok: true, data: "before", evidenceIds: [], durationMs: 1 },
          },
        ],
        [
          secondKey,
          {
            key: secondKey,
            result: { ok: true, data: "after", evidenceIds: [], durationMs: 1 },
          },
        ],
      ]),
    );
    expect(await replay.execute("snapshot", {}, "0123456789abcdef")).toMatchObject({
      data: "before",
    });
    expect(await replay.execute("snapshot", {}, "0123456789abcdef")).toMatchObject({
      data: "after",
    });
  });
});
