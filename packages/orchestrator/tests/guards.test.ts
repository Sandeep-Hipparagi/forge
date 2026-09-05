import { describe, expect, it } from "vitest";
import { canStartSession, exitCodeFor } from "../src/index.js";

describe("session guards", () => {
  it("accepts only allowed http targets", () => {
    expect(canStartSession("https://example.test", ["example.test"])).toBe(
      true,
    );
    expect(canStartSession("file:///tmp/test", ["example.test"])).toBe(false);
  });
  it("keeps product findings distinct from harness failures", () => {
    expect(exitCodeFor("COMPLETED", 1)).toBe(1);
    expect(exitCodeFor("ERROR", 1)).toBe(3);
  });
});
