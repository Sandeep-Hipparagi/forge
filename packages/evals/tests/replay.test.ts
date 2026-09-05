import { describe, expect, it } from "vitest";
import { runReplayCase } from "../src/replay.js";
describe("EC-00 replay", () => {
  it("drives the real API to a deterministic terminal session", async () => {
    const result = await runReplayCase();
    expect(result.status).toBe("COMPLETED");
    expect(result.eventSeq).toEqual([]);
  });
});
