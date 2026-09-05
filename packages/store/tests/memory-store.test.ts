import { describe, expect, it } from "vitest";
import { safeArtifactPath } from "../src/index.js";

describe("MemoryStore", () => {
  it("rejects traversal escapes", () => {
    expect(() => safeArtifactPath("artifacts/../secrets.txt")).toThrow();
    expect(safeArtifactPath("artifacts/ses_00000000/log.json")).toContain(
      "artifacts/",
    );
  });
});
