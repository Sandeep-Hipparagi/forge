import { once } from "node:events";
import { createApiServer } from "@forge/api";

export const runReplayCase = async (): Promise<{
  status: string;
  eventSeq: number[];
}> => {
  const { server } = createApiServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("API did not bind a port");
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const created = await fetch(`${base}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.test" }),
    });
    if (created.status !== 201) throw new Error("session creation failed");
    const session = (await created.json()) as { id: string };
    await new Promise((resolve) => setImmediate(resolve));
    const finished = (await fetch(`${base}/sessions/${session.id}`).then(
      (response) => response.json(),
    )) as { status: string };
    const events = (await fetch(`${base}/sessions/${session.id}/events`).then(
      (response) => response.json(),
    )) as { events: Array<{ seq: number }> };
    return {
      status: finished.status,
      eventSeq: events.events.map((event) => event.seq),
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};
