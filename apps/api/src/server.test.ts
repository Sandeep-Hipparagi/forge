import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunContext } from "@forge/core";
import { ForgeStore } from "@forge/store";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildForgeServer, listenForgeServer } from "./server.js";

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

describe("FORGE API shell", () => {
  let directory: string;
  let store: ForgeStore;
  let app: FastifyInstance;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "forge-api-"));
    const runContext = context();
    store = new ForgeStore({
      databasePath: join(directory, "forge.db"),
      repositoryRoot: directory,
      context: runContext,
    });
    app = buildForgeServer({
      store,
      context: runContext,
      allowedHosts: ["shop.test"],
    });
  });

  afterEach(async () => {
    await app.close();
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("creates once, never echoes a password, and auto-runs the persisted FSM", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers: { "idempotency-key": "create-checkout" },
      payload: {
        url: "https://shop.test/",
        username: "ada",
        password: "secret",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "CREATED", input: { username: "ada" } });
    expect(response.body).not.toContain("secret");
    const sessionId = response.json<{ id: string }>().id;

    await vi.waitFor(() => {
      expect(store.getSession(sessionId)?.status).toBe("COMPLETED");
    });
    const events = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/events`,
    });
    const eventBody = events.json<{ events: Array<{ seq: number; type: string }> }>();
    expect(eventBody.events.map(({ seq }) => seq)).toEqual(
      Array.from({ length: eventBody.events.length }, (_, index) => index),
    );
    expect(eventBody.events.at(-1)?.type).toBe("session.finished");

    const replay = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers: { "idempotency-key": "create-checkout" },
      payload: { url: "https://shop.test/" },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json<{ id: string }>().id).toBe(sessionId);
    expect(store.listSessions()).toHaveLength(1);
  });

  it("replays terminal SSE events after Last-Event-ID and then closes", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test/" },
    });
    const sessionId = created.json<{ id: string }>().id;
    await vi.waitFor(() => {
      expect(store.getSession(sessionId)?.status).toBe("COMPLETED");
    });

    const stream = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/stream`,
      headers: { "last-event-id": "2" },
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.headers["content-type"]).toContain("text/event-stream");
    expect(stream.body).toContain("retry: 2000");
    expect(stream.body).not.toContain("id: 2\n");
    expect(stream.body).toContain("event: session.finished");
  });

  it("returns stable validation, allowlist, not-found, and invalid-state errors", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "not a url" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

    const denied = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://other.test/" },
    });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toMatchObject({ error: { code: "HOST_NOT_ALLOWED" } });

    const missing = await app.inject({ method: "GET", url: "/api/laps/lap_missing0" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });

    const created = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { url: "https://shop.test/" },
    });
    const sessionId = created.json<{ id: string }>().id;
    await vi.waitFor(() => {
      expect(store.getSession(sessionId)?.status).toBe("COMPLETED");
    });
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/cancel`,
    });
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json()).toMatchObject({ error: { code: "INVALID_STATE" } });
  });

  it("registers every documented endpoint group during the stub phase", async () => {
    const checks = [
      "/api/sessions/missing/map",
      "/api/sessions/missing/capabilities",
      "/api/laps/missing/plans/0",
      "/api/runs/missing",
      "/api/diagnoses/missing",
      "/api/evidence/missing",
      "/api/sessions/missing/report",
      "/api/sessions/missing/gates",
      "/api/health",
    ];
    for (const url of checks) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).not.toBe(500);
      expect(response.statusCode, url).not.toBe(405);
    }
  });

  it("listens on loopback when no host override is supplied", async () => {
    await listenForgeServer(app, 0);
    expect(app.addresses()).toEqual([expect.objectContaining({ address: "127.0.0.1" })]);
  });
});
