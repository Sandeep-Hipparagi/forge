import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunContext } from "@forge/core";
import {
  closeExplorationBrowser,
  openExplorationBrowser,
  type ExplorationBrowser,
} from "@forge/runner";
import { ForgeStore } from "@forge/store";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { absoluteStorageStatePath, authenticateSession } from "./authenticate.js";

const SECRET = "p@ssw0rd-never-on-disk";
const USER = "demo-user";

const LOGIN_HTML = `<!doctype html>
<html lang="en">
  <head><title>Sign in</title></head>
  <body>
    <main>
      <form aria-label="Sign in" method="GET" action="/app">
        <label>Username <input name="username" id="username" autocomplete="username" type="text" /></label>
        <label>Password <input name="password" id="password" autocomplete="current-password" type="password" /></label>
        <button type="submit">Sign in</button>
      </form>
    </main>
    <script>
      document.querySelector("form").addEventListener("submit", (event) => {
        event.preventDefault();
        const user = document.querySelector("#username").value;
        const pass = document.querySelector("#password").value;
        if (user === ${JSON.stringify(USER)} && pass === ${JSON.stringify(SECRET)}) {
          document.cookie = "sid=authenticated; path=/";
          location.href = "/app";
        } else {
          const alert = document.createElement("div");
          alert.setAttribute("role", "alert");
          alert.textContent = "Invalid credentials";
          document.body.prepend(alert);
        }
      });
    </script>
  </body>
</html>`;

const APP_HTML = `<!doctype html>
<html lang="en">
  <head><title>Dashboard</title></head>
  <body>
    <main>
      <h1>Welcome</h1>
      <button>Log out</button>
    </main>
  </body>
</html>`;

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

function startFixtureServer(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/app")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(APP_HTML);
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(LOGIN_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected TCP address");
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe("authenticateSession (Playwright login + storageState)", () => {
  let directory: string;
  let store: ForgeStore;
  let fixture: { server: Server; origin: string };

  beforeAll(async () => {
    fixture = await startFixtureServer();
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "forge-auth-"));
    store = new ForgeStore({
      databasePath: join(directory, "forge.db"),
      repositoryRoot: directory,
      context: context(),
    });
  });

  afterEach(async () => {
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("logs in once via detectLoginForm, writes .auth/state.json, and never re-logins", async () => {
    const session = store.createSession({
      url: fixture.origin + "/",
      username: USER,
      mode: "autopilot",
      budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
    });

    let firstAttempts = 0;
    const firstBrowser = await openExplorationBrowser({});
    expect(firstBrowser.ok).toBe(true);
    if (!firstBrowser.ok) return;
    const handle: ExplorationBrowser = firstBrowser.data;

    const first = await authenticateSession({
      store,
      sessionId: session.id,
      credentials: { username: USER, password: SECRET },
      entryUrl: fixture.origin + "/",
      browser: handle,
    });

    expect(first.authenticated).toBe(true);
    expect(first.reason).toBe("AUTHENTICATED");
    expect(first.loginAttempts).toBeGreaterThanOrEqual(1);
    expect(first.storageStatePath).toContain(`artifacts/sessions/${session.id}/.auth/state.json`);
    firstAttempts = first.loginAttempts;

    const absolute = absoluteStorageStatePath(directory, first.storageStatePath!);
    const stateJson = readFileSync(absolute, "utf8");
    expect(stateJson).toContain("sid");
    expect(stateJson).not.toContain(SECRET);
    expect(stateJson).not.toContain(USER);

    // Second call must reuse storageState — zero interactive logins.
    const second = await authenticateSession({
      store,
      sessionId: session.id,
      credentials: { username: USER, password: SECRET },
      entryUrl: fixture.origin + "/",
      browser: handle,
    });
    expect(second.reason).toBe("REUSED_STORAGE_STATE");
    expect(second.loginAttempts).toBe(0);
    expect(second.storageStatePath).toBe(first.storageStatePath);
    expect(second.authenticated).toBe(true);

    // New context seeded with storageState reaches /app without a login form.
    await closeExplorationBrowser(handle);
    const reused = await openExplorationBrowser({ storageStatePath: absolute });
    expect(reused.ok).toBe(true);
    if (!reused.ok) return;
    await reused.data.page.goto(fixture.origin + "/app", { waitUntil: "domcontentloaded" });
    expect(await reused.data.page.title()).toBe("Dashboard");
    expect(await reused.data.page.content()).toContain("Log out");
    expect(await reused.data.page.content()).not.toContain('type="password"');
    await closeExplorationBrowser(reused.data);

    // ensureStorageState producer is never called twice.
    let producerCalls = 0;
    await store.ensureStorageState(session.id, async () => {
      producerCalls += 1;
      return { cookies: [], origins: [] };
    });
    expect(producerCalls).toBe(0);
    expect(firstAttempts).toBe(first.loginAttempts);

    // I-16: credential grep over artifacts finds nothing.
    const artifactsRoot = join(directory, "artifacts");
    const stack = [artifactsRoot];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        const body = readFileSync(full, "utf8");
        expect(body, full).not.toContain(SECRET);
      }
    }
  }, 30_000);

  it("proceeds unauthenticated when credentials are wrong", async () => {
    const session = store.createSession({
      url: fixture.origin + "/",
      username: USER,
      mode: "autopilot",
      budget: { maxCapabilities: 20, maxDurationMs: 1_800_000, maxUsd: 2 },
    });

    const result = await authenticateSession({
      store,
      sessionId: session.id,
      credentials: { username: USER, password: "wrong-password" },
      entryUrl: fixture.origin + "/",
    });

    expect(result.authenticated).toBe(false);
    expect(result.storageStatePath).toBeNull();
    expect(store.getSession(session.id)?.authenticated).toBe(false);
    expect(store.getSession(session.id)?.storageStatePath).toBeNull();
  }, 30_000);
});
