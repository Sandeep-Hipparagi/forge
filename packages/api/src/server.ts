import { createServer, type Server } from "node:http";
import { defaultSessionConfig, SessionInput, type Session } from "@forge/core";
import { runStubSession, type SessionStore } from "@forge/orchestrator";
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

interface LapRecord {
  id: string;
  sessionId: string;
  [key: string]: unknown;
}

interface ReportRecord {
  id: string;
  sessionId: string;
  [key: string]: unknown;
}

function hasGetLapsBySession(store: SessionStore): store is SessionStore & {
  getLapsBySession(sessionId: string): LapRecord[];
} {
  return typeof store.getLapsBySession === "function";
}

function hasGetReportBySession(store: SessionStore): store is SessionStore & {
  getReportBySession(sessionId: string): ReportRecord | undefined;
} {
  return typeof store.getReportBySession === "function";
}

function hasGetEvidence(
  store: SessionStore,
): store is SessionStore & { getEvidence(sessionId: string): unknown[] } {
  return typeof store.getEvidence === "function";
}

export const createApiServer = (
  store: SessionStore = new MemoryStore(),
): { server: Server; store: SessionStore } => {
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
    const sessionMatch = url.pathname.match(
      /^\/api\/sessions\/(ses_[a-z0-9]+)(?:\/(events|stream|laps|report|evidence))?$/,
    );
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      if (!sessionId)
        return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
      const session = store.sessions.get(sessionId);
      if (!session)
        return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
      const subPath = sessionMatch[2];
      const sinceParam = url.searchParams.get("since");
      const since = sinceParam ? parseInt(sinceParam, 10) : -1;
      if (subPath === "events")
        return sendJson(response, 200, {
          events: store.getEvents(session.id, since),
        });
      if (subPath === "stream") {
        response.setHeader("content-type", "text/event-stream");
        response.setHeader("cache-control", "no-cache");
        response.setHeader("connection", "keep-alive");
        for (const event of store.getEvents(session.id, since))
          response.write(
            `id: ${event.seq ?? event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        return response.end();
      }
      if (subPath === "laps") {
        if (!hasGetLapsBySession(store))
          return sendJson(response, 501, {
            error: { code: "NOT_IMPLEMENTED" },
          });
        return sendJson(response, 200, {
          laps: store.getLapsBySession(session.id),
        });
      }
      if (subPath === "report") {
        if (!hasGetReportBySession(store))
          return sendJson(response, 501, {
            error: { code: "NOT_IMPLEMENTED" },
          });
        const report = store.getReportBySession(session.id);
        if (!report)
          return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
        return sendJson(response, 200, report);
      }
      if (subPath === "evidence") {
        if (!hasGetEvidence(store))
          return sendJson(response, 501, {
            error: { code: "NOT_IMPLEMENTED" },
          });
        return sendJson(response, 200, {
          evidence: store.getEvidence(session.id),
        });
      }
      return sendJson(response, 200, session);
    }
    return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
  });
  return { server, store };
};
