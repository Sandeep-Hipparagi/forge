import type { Session } from "@forge/core";

const TERMINAL = new Set<Session["status"]>([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "ESCALATED",
  "ERROR",
]);

export async function runSession(
  url: string | undefined,
  apiBase = process.env.FORGE_API_URL ?? "http://127.0.0.1:4000/api",
): Promise<number> {
  if (url === undefined) {
    console.error("forge run: URL is required");
    return 3;
  }
  try {
    const created = await fetch(`${apiBase}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (created.status !== 201) {
      console.error(`forge run: API returned ${created.status}: ${await created.text()}`);
      return 3;
    }
    const initial = (await created.json()) as Session;
    console.log(`FORGE session ${initial.id} created`);
    const deadline = performance.now() + 31 * 60_000;
    while (performance.now() < deadline) {
      const response = await fetch(`${apiBase}/sessions/${initial.id}`);
      if (!response.ok) {
        console.error(`forge run: polling returned ${response.status}`);
        return 3;
      }
      const session = (await response.json()) as Session;
      if (TERMINAL.has(session.status)) {
        console.log(`${session.status} · exit ${session.exitCode ?? 3}`);
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
