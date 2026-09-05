import { describe, expect, it } from "vitest";
import { resolveExploreAuth } from "./live-session.js";

describe("resolveExploreAuth", () => {
  it("passes through in-memory credentials so password survives the API strip", () => {
    expect(
      resolveExploreAuth({
        storedUsername: "stored-user",
        credentials: { username: "live-user", password: "secret" },
      }),
    ).toEqual({ username: "live-user", password: "secret" });
  });

  it("falls back to stored username when kickoff has no credentials", () => {
    expect(resolveExploreAuth({ storedUsername: "ada" })).toEqual({ username: "ada" });
  });

  it("returns empty when neither source has a username", () => {
    expect(resolveExploreAuth({})).toEqual({});
  });
});
