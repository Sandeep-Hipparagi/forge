import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createApiServer } from "../src/index.js";

describe("Phase 1 API", () => {
  it("creates a credential-free persisted stub session", async () => {
    const { server } = createApiServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/sessions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://example.test",
          password: "secret",
        }),
      },
    );
    const session = (await response.json()) as {
      id: string;
      input: Record<string, unknown>;
    };
    expect(response.status).toBe(201);
    expect(session.input.password).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    const completed = (await fetch(
      `http://127.0.0.1:${address.port}/api/sessions/${session.id}`,
    ).then((item) => item.json())) as { status: string };
    expect(completed.status).toBe("COMPLETED");
    server.close();
  });
});
