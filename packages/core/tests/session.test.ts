import { describe, expect, it } from "vitest";
import {
  Session,
  SessionInput,
  createSeededRng,
  defaultSessionConfig,
} from "@forge/core";

const config = defaultSessionConfig();

describe("session schema", () => {
  it("accepts credentials only at the input boundary", () => {
    const input = SessionInput.parse({
      url: "https://example.test",
      password: "never-persist-this",
    });

    expect(input.password).toBe("never-persist-this");
    expect(() =>
      Session.parse({
        id: "ses_00000000",
        input,
        status: "CREATED",
        config,
        configSha256: "a".repeat(64),
        createdAt: "2026-09-05T00:00:00.000Z",
        finishedAt: null,
        exitCode: null,
        usage: null,
      }),
    ).toThrow();
  });

  it("produces a repeatable injected random sequence", () => {
    const first = createSeededRng(42);
    const second = createSeededRng(42);
    expect([first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
    ]);
  });
});
