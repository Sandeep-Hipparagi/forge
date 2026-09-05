#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { systemRunContext } from "@forge/core";
import { exploreSession } from "@forge/orchestrator";
import { ForgeStore } from "@forge/store";

function parseFlags(argv: string[]): {
  url: string | undefined;
  user: string | undefined;
  pass: string | undefined;
  intent: string | undefined;
  headed: boolean;
} {
  let url: string | undefined;
  let user: string | undefined;
  let pass: string | undefined;
  let intent: string | undefined;
  let headed = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--user" || arg === "--username") {
      user = argv[++i];
      continue;
    }
    if (arg === "--pass" || arg === "--password") {
      pass = argv[++i];
      continue;
    }
    if (arg === "--intent") {
      intent = argv[++i];
      continue;
    }
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (!arg.startsWith("-") && url === undefined) {
      url = arg;
    }
  }
  return { url, user, pass, intent, headed };
}

/**
 * forge explore <url> — exploration only → capability map + ranked backlog (15 §6).
 */
export async function runExplore(argv: string[], repoRoot: string): Promise<number> {
  const flags = parseFlags(argv);
  if (flags.url === undefined) {
    console.error("forge explore: URL is required");
    return 3;
  }

  const previousLlm = process.env["FORGE_LLM_ENABLED"];
  // Prefer deterministic crawl unless the operator explicitly enabled the LLM.
  if (previousLlm === undefined && !process.env["ANTHROPIC_API_KEY"]) {
    process.env["FORGE_LLM_ENABLED"] = "false";
  }

  const context = systemRunContext();
  const runDirectory = join(repoRoot, "artifacts", "explore");
  mkdirSync(runDirectory, { recursive: true });
  const store = new ForgeStore({
    databasePath: join(runDirectory, "forge.db"),
    repositoryRoot: repoRoot,
    context,
  });

  try {
    console.log(`FORGE explore · ${flags.url}`);
    const result = await exploreSession({
      store,
      context,
      input: {
        url: flags.url,
        ...(flags.user !== undefined ? { username: flags.user } : {}),
        ...(flags.pass !== undefined ? { password: flags.pass } : {}),
        ...(flags.intent !== undefined ? { intent: flags.intent } : {}),
        headless: !flags.headed,
        terminal: true,
        forceDeterministic: (process.env["FORGE_LLM_ENABLED"] ?? "true") === "false",
      },
    });

    const { map, choiceSource, modelCalls, session } = result;
    console.log(
      `session ${session.id} · ${map.frontier.haltReason} · source=${choiceSource} · modelCalls=${modelCalls}`,
    );
    console.log(
      `states ${map.states.length} · transitions ${map.transitions.length} · capabilities ${map.capabilities.length}`,
    );
    console.log("backlog:");
    for (const capability of map.capabilities) {
      console.log(
        `  ${capability.priorityRank + 1}. ${capability.name}  risk=${capability.risk.score.toFixed(3)}`,
      );
    }
    return session.exitCode ?? 0;
  } catch (error) {
    console.error(`forge explore: ${error instanceof Error ? error.message : "failed"}`);
    return 3;
  } finally {
    store.close();
    if (previousLlm === undefined) delete process.env["FORGE_LLM_ENABLED"];
    else process.env["FORGE_LLM_ENABLED"] = previousLlm;
  }
}
