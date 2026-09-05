import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunContext } from "@forge/core";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForgeStore } from "./store.js";

const SECRET = "super-secret-password";

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

describe("ForgeStore invariants", () => {
  let directory: string;
  let databasePath: string;
  let store: ForgeStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "forge-store-"));
    databasePath = join(directory, "forge.db");
    store = new ForgeStore({
      databasePath,
      repositoryRoot: directory,
      context: context(),
    });
  });

  afterEach(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  function createSession(password?: string) {
    return store.createSession({
      url: "https://shop.test/",
      password,
      mode: "autopilot",
      budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
    });
  }

  it("keeps events append-only with a gapless per-session sequence", () => {
    const session = createSession();
    for (let index = 0; index < 100; index += 1) {
      store.appendEvent({
        sessionId: session.id,
        lapId: null,
        actor: "orchestrator",
        type: "session.started",
        payload: { index },
      });
    }
    expect(store.listEvents(session.id).map(({ seq }) => seq)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    );

    const raw = new Database(databasePath);
    expect(() => raw.prepare("UPDATE session_events SET seq = 101").run()).toThrow("append-only");
    expect(() => raw.prepare("DELETE FROM session_events").run()).toThrow("append-only");
    raw.close();
  });

  it("rolls back the state row when its transition event cannot commit", () => {
    const session = createSession();
    expect(() =>
      store.commitSessionTransition(
        session.id,
        { status: "EXPLORING" },
        {
          sessionId: "invalid",
          lapId: null,
          actor: "orchestrator",
          type: "session.started",
          payload: {},
        },
      ),
    ).toThrow();
    expect(store.getSession(session.id)?.status).toBe("CREATED");
    expect(store.listEvents(session.id)).toEqual([]);
  });

  it("uses full hashes for identity and never overwrites on a short-prefix collision", () => {
    const session = createSession();
    let call = 0;
    store.close();
    store = new ForgeStore({
      databasePath,
      repositoryRoot: directory,
      context: context(),
      hash: () => `0123456789ab${(call++ === 0 ? "a" : "b").repeat(52)}`,
    });
    const first = store.putEvidence({
      sessionId: session.id,
      lapId: null,
      runId: null,
      stepId: null,
      type: "DOM",
      label: "first",
      metadata: {},
      content: "first body",
    });
    const second = store.putEvidence({
      sessionId: session.id,
      lapId: null,
      runId: null,
      stepId: null,
      type: "DOM",
      label: "second",
      metadata: {},
      content: "second body",
    });

    expect(first.sha256.slice(0, 12)).toBe(second.sha256.slice(0, 12));
    expect(first.sha256).not.toBe(second.sha256);
    expect(first.path).not.toBe(second.path);
    expect(readFileSync(join(directory, first.path), "utf8")).toBe("first body");
    expect(readFileSync(join(directory, second.path), "utf8")).toBe("second body");
  });

  it("blocks path traversal and writes outside the allowlist", () => {
    expect(() => store.safeWrite("../escape.txt", "no")).toThrow("allowlist");
    expect(() => store.safeWrite("packages/core/owned.txt", "no")).toThrow("allowlist");
    expect(store.safeWrite("artifacts/allowed.txt", "yes")).toBe(
      join(directory, "artifacts/allowed.txt"),
    );
  });

  it("writes storageState once and reuses it without re-logins", async () => {
    const session = createSession();
    let calls = 0;
    const firstPath = await store.ensureStorageState(session.id, async () => {
      calls += 1;
      return { cookies: [{ name: "sid", value: "abc" }], origins: [] };
    });
    const secondPath = await store.ensureStorageState(session.id, async () => {
      calls += 1;
      return { cookies: [{ name: "sid", value: "xyz" }], origins: [] };
    });

    expect(firstPath).toBe(secondPath);
    expect(calls).toBe(1);

    const reloaded = store.getSession(session.id)!;
    expect(reloaded.storageStatePath).toBe(firstPath);
    expect(firstPath).toContain(`artifacts/sessions/${session.id}/.auth/state.json`);

    const content = readFileSync(join(directory, firstPath), "utf8");
    expect(content).toContain('"cookies"');
  });

  it("never persists session passwords or secrets in events and artifacts", async () => {
    const session = createSession(SECRET);
    expect(session.input).not.toHaveProperty("password");
    await store.ensureStorageState(session.id, async () => ({
      cookies: [],
      origins: [],
    }));
    store.appendEvent(
      {
        sessionId: session.id,
        lapId: null,
        actor: "orchestrator",
        type: "session.started",
        payload: { password: SECRET, message: `credential=${SECRET}` },
      },
      [SECRET],
    );
    const evidence = store.putEvidence(
      {
        sessionId: session.id,
        lapId: null,
        runId: null,
        stepId: null,
        type: "DOM",
        label: "redacted",
        metadata: { authorization: `Bearer ${SECRET}` },
        content: `<input value="${SECRET}">`,
      },
      [SECRET],
    );
    store.close();

    function readAllFiles(root: string): Buffer[] {
      const entries = readdirSync(root, { withFileTypes: true });
      const files: Buffer[] = [];
      for (const entry of entries) {
        const full = join(root, entry.name);
        if (entry.isDirectory()) {
          files.push(...readAllFiles(full));
        } else {
          files.push(readFileSync(full));
        }
      }
      return files;
    }

    const artifactsRoot = join(directory, "artifacts");
    const persisted = [readFileSync(databasePath), ...readAllFiles(artifactsRoot)];
    expect(Buffer.concat(persisted).includes(Buffer.from(SECRET))).toBe(false);

    store = new ForgeStore({ databasePath, repositoryRoot: directory, context: context() });
    expect(store.resolveEvidence([evidence.id])).toHaveLength(1);
  });
});
