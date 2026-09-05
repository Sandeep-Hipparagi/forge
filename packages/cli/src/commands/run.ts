import type { Session } from "@forge/core";

const TERMINAL = new Set<Session["status"]>([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);

function parseRunArgs(argv: string[]): {
  url: string | undefined;
  user: string | undefined;
  pass: string | undefined;
  intent: string | undefined;
  live: boolean;
} {
  let url: string | undefined;
  let user: string | undefined;
  let pass: string | undefined;
  let intent: string | undefined;
  let live = false;
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
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (!arg.startsWith("-") && url === undefined) {
      url = arg;
    }
  }
  return { url, user, pass, intent, live };
}

/**
 * forge run <url> [--user U] [--pass P] [--intent …] [--live]
 * Creates a session via the API and polls until terminal.
 */
export async function runSession(
  argv: string[],
  apiBase = process.env.FORGE_API_URL ?? "http://127.0.0.1:4000/api",
): Promise<number> {
  const flags = parseRunArgs(argv);
  if (flags.url === undefined) {
    console.error("forge run: URL is required");
    console.error(
      "usage: forge run <url> [--user <username>] [--pass <password>] [--intent <text>] [--live]",
    );
    return 3;
  }
  try {
    const created = await fetch(`${apiBase}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: flags.url,
        live: flags.live,
        ...(flags.user !== undefined ? { username: flags.user } : {}),
        ...(flags.pass !== undefined ? { password: flags.pass } : {}),
        ...(flags.intent !== undefined ? { intent: flags.intent } : {}),
      }),
    });
    if (created.status !== 201) {
      console.error(`forge run: API returned ${created.status}: ${await created.text()}`);
      return 3;
    }
    const initial = (await created.json()) as Session;
    console.log(
      `FORGE session ${initial.id} created${flags.live ? " · live" : ""}${flags.user ? " · with credentials" : ""}`,
    );
    const deadline = performance.now() + 31 * 60_000;
    while (performance.now() < deadline) {
      const response = await fetch(`${apiBase}/sessions/${initial.id}`);
      if (!response.ok) {
        console.error(`forge run: polling returned ${response.status}`);
        return 3;
      }
      const session = (await response.json()) as Session;
      if (TERMINAL.has(session.status)) {
        console.log(
          `${session.status} · exit ${session.exitCode ?? 3}${session.authenticated ? " · signed in" : ""}`,
        );
        return session.exitCode ?? 3;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    console.error("forge run: session polling deadline exceeded");
    return 3;
  } catch (error) {
    console.error(`forge run: ${error instanceof Error ? error.message : "API unavailable"}`);
    return 3;
  }
}
