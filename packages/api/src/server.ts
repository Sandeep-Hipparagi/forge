import { createServer, type Server } from "node:http";
import { defaultSessionConfig, SessionInput, type Session } from "@forge/core";
import { runStubSession } from "@forge/orchestrator";
import { MemoryStore, sha256 } from "@forge/store";

const sendJson = (
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

export const createApiServer = (
  store = new MemoryStore(),
): { server: Server; store: MemoryStore } => {
  let counter = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/api/health")
      return sendJson(response, 200, { ok: true });
    if (request.method === "POST" && url.pathname === "/api/sessions") {
      let body = "";
      for await (const chunk of request) body += chunk;
      let rawBody: unknown;
      try {
        rawBody = JSON.parse(body || "{}");
      } catch {
        return sendJson(response, 400, {
          error: {
            code: "VALIDATION_FAILED",
            message: "Malformed JSON payload",
          },
        });
      }
      const inputResult = SessionInput.safeParse(rawBody);
      if (!inputResult.success)
        return sendJson(response, 400, {
          error: {
            code: "VALIDATION_FAILED",
            issues: inputResult.error.issues,
          },
        });
      const config = defaultSessionConfig();
      const host = new URL(inputResult.data.url).hostname;
      if (!config.exploration.allowedHosts.includes(host))
        return sendJson(response, 400, {
          error: {
            code: "HOST_NOT_ALLOWED",
            message: "URL host is not allowed",
          },
        });
      const id = `ses_${String(counter++).padStart(8, "0")}`;
      const { password: _password, ...input } = inputResult.data;
      void _password;
      const session: Session = {
        id,
        input,
        status: "CREATED",
        authenticated: false,
        config,
        configSha256: sha256(JSON.stringify(config)),
        storageStatePath: null,
        exitCode: null,
        defectsFound: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        finishedAt: null,
        usage: null,
      };
      store.createSession(session);
      sendJson(response, 201, session);
      queueMicrotask(() => runStubSession(store, id));
      return;
    }
    const match = url.pathname.match(
      /^\/api\/sessions\/(ses_[a-z0-9]+)(?:\/(events|stream))?$/,
    );
    if (match) {
      const sessionId = match[1];
      if (!sessionId)
        return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
      const session = store.sessions.get(sessionId);
      if (!session)
        return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
      if (match[2] === "events")
        return sendJson(response, 200, { events: store.getEvents(session.id) });
      if (match[2] === "stream") {
        response.setHeader("content-type", "text/event-stream");
        for (const event of store.getEvents(session.id))
          response.write(
            `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        return response.end();
      }
      return sendJson(response, 200, session);
    }
    return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
  });
  return { server, store };
};
