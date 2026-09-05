import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile, compileFixturePlan, emitProject, type RunContext } from "@forge/core";
import { ForgeStore } from "@forge/store";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executeSuite } from "./execute.js";
import { writeEmittedProject } from "./write-project.js";

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <body>
    <main>
      <label>Full name <input type="text" /></label>
      <button type="button" id="continue-btn">Continue</button>
      <h1 hidden id="confirm">Order confirmed</h1>
    </main>
    <script>
      document.getElementById("continue-btn").addEventListener("click", () => {
        document.getElementById("confirm").hidden = false;
      });
    </script>
  </body>
</html>`;

function storeContext(): RunContext {
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

describe("Runner · Ph4", () => {
  let browser: Browser;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(FIXTURE_HTML);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    closeServer = () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await closeServer?.();
  });

  it("emitted suite runs green with DOM + screenshot evidence; healAttempts 0", async () => {
    const { plan, affordances, states, capabilityName } = compileFixturePlan();
    const runStates = states.map((s, i) => (i === 0 ? { ...s, url: `${baseUrl}/cart` } : s));
    const suite = compile(plan, {
      capabilityName,
      affordances,
      states: runStates,
      assessmentScore: 0.8435,
      floor: 0.7,
    });
    const project = emitProject(suite, {
      sessionId: "ses_01j9run01",
      planId: plan.id,
      modelId: "none",
      browserRevision: "chromium-pinned",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const outDir = await mkdtemp(join(tmpdir(), "forge-suite-"));
    const storeDir = await mkdtemp(join(tmpdir(), "forge-store-"));
    const store = new ForgeStore({
      databasePath: join(storeDir, "forge.db"),
      repositoryRoot: storeDir,
      context: storeContext(),
    });

    try {
      const written = writeEmittedProject(project, outDir);
      expect(written).toContain("tests/generated/checkout.spec.ts");

      const session = store.createSession({
        url: baseUrl,
        mode: "autopilot",
        budget: { maxCapabilities: 1, maxDurationMs: 60_000, maxUsd: 1 },
      });

      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/cart`);

      const secret = "Ada Lovelace";
      const evidencePaths: string[] = [];
      const result = await executeSuite(suite, page, {
        secrets: [secret],
        onEvidence: (row) => {
          const dom = store.putEvidence(
            {
              sessionId: session.id,
              lapId: null,
              runId: null,
              stepId: row.stepId,
              type: "DOM",
              label: `${row.scenarioId}:${row.stepId}:dom`,
              content: row.dom,
              metadata: {},
            },
            [secret],
          );
          const shot = store.putEvidence({
            sessionId: session.id,
            lapId: null,
            runId: null,
            stepId: row.stepId,
            type: "SCREENSHOT",
            label: `${row.scenarioId}:${row.stepId}:screenshot`,
            content: row.screenshot,
            metadata: {},
          });
          evidencePaths.push(dom.path, shot.path);
          expect(dom.path).toContain(dom.sha256.slice(0, 12));
          expect(shot.path).toContain(shot.sha256.slice(0, 12));
          expect(row.dom).not.toContain(secret);
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.healAttempts).toBe(0);
      expect(
        result.data.scenarios[0]!.status,
        result.data.scenarios[0]!.errorMessage ?? "no error",
      ).toBe("VERIFIED");
      // 4 steps × (DOM + screenshot)
      expect(evidencePaths).toHaveLength(8);

      await context.close();
    } finally {
      store.close();
      await rm(outDir, { recursive: true, force: true });
      await rm(storeDir, { recursive: true, force: true });
    }
  }, 60_000);
});
