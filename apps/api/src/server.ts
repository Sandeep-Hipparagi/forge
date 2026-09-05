import {
  SessionInput,
  buildReport,
  demoReportInput,
  renderMarkdown,
  stubReportInput,
  type Lap,
  type ReportInput,
  type RunContext,
  type Session,
  type SessionEvent,
  type SessionStatus,
} from "@forge/core";
import {
  LapMachine,
  SessionMachine,
  exitCodeFor,
  runLiveSession,
  tg1CanExplore,
} from "@forge/orchestrator";
import type { ForgeStore } from "@forge/store";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
type Subscriber = (event: SessionEvent) => void;

class EventBus {
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  publish(event: SessionEvent): void {
    for (const subscriber of this.subscribers.get(event.sessionId) ?? []) {
      subscriber(event);
    }
  }

  subscribe(sessionId: string, subscriber: Subscriber): () => void {
    const sessionSubscribers = this.subscribers.get(sessionId) ?? new Set();
    sessionSubscribers.add(subscriber);
    this.subscribers.set(sessionId, sessionSubscribers);
    return () => {
      sessionSubscribers.delete(subscriber);
      if (sessionSubscribers.size === 0) this.subscribers.delete(sessionId);
    };
  }
}

export type ForgeServerOptions = {
  store: ForgeStore;
  context: RunContext;
  allowedHosts?: readonly string[];
  webOrigin?: string;
  autoRun?: boolean;
  /** When true, POST /sessions with live:true runs the real browser pipeline. */
  liveSessions?: boolean;
  /** Repository root — used to load artifacts/sessions/<id>/report-input.json */
  repositoryRoot?: string;
};

const TERMINAL = new Set<SessionStatus>(["COMPLETED", "COMPLETED_PARTIAL", "ESCALATED", "ERROR"]);

function notFound(reply: FastifyReply, resource: string): FastifyReply {
  return reply.code(404).send({
    error: { code: "NOT_FOUND", message: `${resource} was not found` },
  });
}

function sessionResponse(session: Session): Session & { stream: string } {
  return { ...session, stream: `/api/sessions/${session.id}/stream` };
}

function eventTypeForSession(status: SessionStatus): SessionEvent["type"] {
  if (status === "EXPLORING") return "session.started";
  if (status === "PRIORITISING") return "explore.finished";
  if (status === "LAPPING") return "capabilities.ranked";
  if (status === "REPORTING") return "report.generated";
  return "session.finished";
}

function eventTypeForLap(status: Lap["status"]): SessionEvent["type"] {
  const types: Partial<Record<Lap["status"], SessionEvent["type"]>> = {
    PLANNING: "lap.started",
    CRITIQUING: "plan.drafted",
    GENERATING: "critique.finished",
    RUNNING: "run.started",
    BANKED: "lap.banked",
  };
  return types[status] ?? "step.finished";
}

export function buildForgeServer(options: ForgeServerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 220_000 });
  const bus = new EventBus();
  const allowedHosts = options.allowedHosts ?? [];
  const webOrigin = options.webOrigin ?? "http://localhost:3000";
  const liveSessions =
    options.liveSessions ?? (process.env.FORGE_LIVE_SESSIONS ?? "false").toLowerCase() === "true";
  const repositoryRoot = options.repositoryRoot ?? process.cwd();

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.headers.origin === webOrigin) {
      void reply.header("Access-Control-Allow-Origin", webOrigin);
      void reply.header(
        "Access-Control-Allow-Headers",
        "content-type, idempotency-key, last-event-id",
      );
      void reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    return payload;
  });

  app.options("/*", async (request, reply) => {
    if (request.headers.origin === webOrigin) {
      void reply.header("Access-Control-Allow-Origin", webOrigin);
      void reply.header(
        "Access-Control-Allow-Headers",
        "content-type, idempotency-key, last-event-id",
      );
      void reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    return reply.code(204).send();
  });

  async function runStubSession(sessionId: string): Promise<void> {
    let session = options.store.getSession(sessionId);
    if (session === null || TERMINAL.has(session.status)) return;

    try {
      let pendingSessionEvent: SessionEvent | null = null;
      const sessionMachine = new SessionMachine(
        session.status,
        (next) => {
          const terminal = TERMINAL.has(next);
          const committed = options.store.commitSessionTransition(
            sessionId,
            terminal
              ? {
                  status: next,
                  exitCode: exitCodeFor(next, session!.defectsFound),
                  finishedAt: options.context.clock.now().toISOString(),
                }
              : { status: next },
            {
              sessionId,
              lapId: null,
              actor: "orchestrator",
              type: eventTypeForSession(next),
              payload: { status: next },
            },
          );
          session = committed.session;
          pendingSessionEvent = committed.event;
        },
        () => {
          if (pendingSessionEvent === null) {
            throw new Error("Session transition committed without an event");
          }
          bus.publish(pendingSessionEvent);
          pendingSessionEvent = null;
        },
      );

      sessionMachine.transition("EXPLORING");
      sessionMachine.transition("PRIORITISING");
      const entryStateId = options.context.ids.next("st");
      const capability = options.store.saveCapability({
        id: options.context.ids.next("cap"),
        sessionId,
        name: "Stubbed end-to-end capability",
        description: "Phase 1 deterministic capability proving the orchestration spine",
        entryStateId,
        stateIds: [entryStateId],
        exitConditions: ["The stub lap reaches a banked outcome"],
        dependsOn: [],
        risk: {
          score: 0,
          factors: {
            authProximity: 0,
            dataMutation: 0,
            moneyOrPii: 0,
            graphCentrality: 0,
            affordanceDensity: 0,
            statedIntent: 0,
          },
        },
        priorityRank: 0,
      });
      sessionMachine.transition("LAPPING");

      let lap: Lap = options.store.createLap({
        id: options.context.ids.next("lap"),
        sessionId,
        capabilityId: capability.id,
        index: 0,
        status: "LAP_PENDING",
        outcome: null,
        replanRounds: 0,
        healAttempts: {},
        acceptedRisk: [],
        specPath: null,
        startedAt: options.context.clock.now().toISOString(),
        bankedAt: null,
      });
      let pendingLapEvent: SessionEvent | null = null;
      const lapMachine = new LapMachine(
        lap.status,
        (next) => {
          const nextLap = {
            ...lap,
            status: next,
            outcome: next === "BANKED" ? ("VERIFIED" as const) : lap.outcome,
            bankedAt: next === "BANKED" ? options.context.clock.now().toISOString() : lap.bankedAt,
          };
          const committed = options.store.commitLapTransition(nextLap, {
            sessionId,
            lapId: lap.id,
            actor: "orchestrator",
            type: eventTypeForLap(next),
            payload: { status: next, outcome: nextLap.outcome },
          });
          lap = committed.lap;
          pendingLapEvent = committed.event;
        },
        () => {
          if (pendingLapEvent === null) {
            throw new Error("Lap transition committed without an event");
          }
          bus.publish(pendingLapEvent);
          pendingLapEvent = null;
        },
      );
      for (const next of ["PLANNING", "CRITIQUING", "GENERATING", "RUNNING", "BANKED"] as const) {
        lapMachine.transition(next);
      }
      sessionMachine.transition("REPORTING");

      const reportPath = join(
        repositoryRoot,
        "artifacts",
        "sessions",
        sessionId,
        "report-input.json",
      );
      mkdirSync(dirname(reportPath), { recursive: true });
      const stubInput = stubReportInput(sessionId, {
        url: session!.input.url,
        generatedAt: options.context.clock.now().toISOString(),
        reportId: options.context.ids.next("rpt"),
        capabilityId: capability.id,
        gapId: options.context.ids.next("gap"),
      });
      writeFileSync(reportPath, `${JSON.stringify(stubInput, null, 2)}\n`, "utf8");

      sessionMachine.transition("COMPLETED");
    } catch (error) {
      const committed = options.store.commitSessionTransition(
        sessionId,
        {
          status: "ERROR",
          exitCode: 3,
          finishedAt: options.context.clock.now().toISOString(),
        },
        {
          sessionId,
          lapId: null,
          actor: "orchestrator",
          type: "session.finished",
          payload: {
            status: "ERROR",
            message: error instanceof Error ? error.message : "Stub pipeline failed",
          },
        },
      );
      session = committed.session;
      bus.publish(committed.event);
    }
  }

  async function kickOffLiveSession(sessionId: string): Promise<void> {
    await runLiveSession({
      store: options.store,
      context: options.context,
      sessionId,
      repositoryRoot,
      maxLaps: 1,
      headless: true,
      onEvent: (event) => bus.publish(event),
    });
  }

  app.post("/api/sessions", async (request, reply) => {
    const parsed = SessionInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Session input is invalid",
          issues: parsed.error.issues,
          requestId: request.id,
        },
      });
    }
    if (parsed.data.live === true && !liveSessions) {
      return reply.code(400).send({
        error: {
          code: "LIVE_DISABLED",
          message:
            "Live sessions are disabled. Set FORGE_LIVE_SESSIONS=true on the API, then retry with live: true.",
          requestId: request.id,
        },
      });
    }
    const target = tg1CanExplore(parsed.data.url, allowedHosts);
    if (!target.allowed) {
      return reply.code(400).send({
        error: { code: "HOST_NOT_ALLOWED", message: target.reason, requestId: request.id },
      });
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey === "string") {
      const existing = options.store.sessionForIdempotencyKey(idempotencyKey);
      if (existing !== null) {
        return reply
          .code(201)
          .header("Location", `/api/sessions/${existing.id}`)
          .send(sessionResponse(existing));
      }
    }

    const session = options.store.createSession(parsed.data);
    if (typeof idempotencyKey === "string") {
      options.store.rememberIdempotencyKey(idempotencyKey, session.id);
    }
    void reply.header("Location", `/api/sessions/${session.id}`);
    if (options.autoRun !== false) {
      if (parsed.data.live === true) {
        setImmediate(() => void kickOffLiveSession(session.id));
      } else {
        setImmediate(() => void runStubSession(session.id));
      }
    }
    return reply.code(201).send(sessionResponse(session));
  });

  app.get("/api/sessions", async () => ({
    sessions: options.store.listSessions().map(sessionResponse),
  }));

  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
    const session = options.store.getSession(request.params.id);
    if (session === null) return notFound(reply, "Session");
    const laps = options.store.listLaps(session.id);
    const capabilities = options.store.listCapabilities(session.id);
    return {
      ...sessionResponse(session),
      currentLapIndex: laps.find(({ status }) => status !== "BANKED")?.index ?? null,
      backlogLength: capabilities.length,
      bankedCount: laps.filter(({ status }) => status === "BANKED").length,
    };
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/cancel", async (request, reply) => {
    const session = options.store.getSession(request.params.id);
    if (session === null) return notFound(reply, "Session");
    if (TERMINAL.has(session.status)) {
      return reply.code(409).send({
        error: { code: "INVALID_STATE", message: "Session is already terminal" },
      });
    }
    const committed = options.store.commitSessionTransition(
      session.id,
      {
        status: "COMPLETED_PARTIAL",
        exitCode: exitCodeFor("COMPLETED_PARTIAL", session.defectsFound),
        finishedAt: options.context.clock.now().toISOString(),
      },
      {
        sessionId: session.id,
        lapId: null,
        actor: "human",
        type: "session.finished",
        payload: { status: "COMPLETED_PARTIAL", reason: "cancelled" },
      },
    );
    bus.publish(committed.event);
    return committed.session;
  });

  app.get<{ Params: { id: string }; Querystring: { since?: string; limit?: string } }>(
    "/api/sessions/:id/events",
    async (request, reply) => {
      if (options.store.getSession(request.params.id) === null) {
        return notFound(reply, "Session");
      }
      const since = Number.parseInt(request.query.since ?? "-1", 10);
      const limit = Math.min(Number.parseInt(request.query.limit ?? "200", 10), 1_000);
      const all = options.store.listEvents(request.params.id).filter(({ seq }) => seq > since);
      const events = all.slice(0, limit);
      return {
        events,
        nextSince: events.at(-1)?.seq ?? since,
        hasMore: all.length > events.length,
      };
    },
  );

  app.get<{ Params: { id: string } }>("/api/sessions/:id/stream", async (request, reply) => {
    const session = options.store.getSession(request.params.id);
    if (session === null) return notFound(reply, "Session");
    const lastEventId = Number.parseInt(String(request.headers["last-event-id"] ?? "-1"), 10);
    reply.hijack();
    const sseHeaders: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    };
    if (request.headers.origin === webOrigin) {
      sseHeaders["Access-Control-Allow-Origin"] = webOrigin;
    }
    reply.raw.writeHead(200, sseHeaders);
    reply.raw.write("retry: 2000\n\n");
    const write = (event: SessionEvent): void => {
      reply.raw.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    options.store
      .listEvents(session.id)
      .filter(({ seq }) => seq > lastEventId)
      .forEach(write);
    if (TERMINAL.has(options.store.getSession(session.id)!.status)) {
      reply.raw.end();
      return;
    }
    let heartbeat: NodeJS.Timeout | undefined;
    const unsubscribe = bus.subscribe(session.id, (event) => {
      write(event);
      if (event.type === "session.finished") {
        unsubscribe();
        if (heartbeat !== undefined) clearInterval(heartbeat);
        reply.raw.end();
      }
    });
    heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.on("close", () => {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
      unsubscribe();
    });
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/capabilities", async (request, reply) => {
    if (options.store.getSession(request.params.id) === null) {
      return notFound(reply, "Session");
    }
    return options.store.listCapabilities(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/map", async (request, reply) => {
    const session = options.store.getSession(request.params.id);
    if (session === null) return notFound(reply, "Session");
    const map = options.store.getCapabilityMap(session.id);
    if (map !== null) return map;
    return {
      sessionId: session.id,
      authenticated: session.authenticated,
      states: [],
      affordances: [],
      transitions: [],
      capabilities: options.store.listCapabilities(session.id),
      apiHints: [],
      frontier: { discovered: 0, explored: 0, haltReason: "EXHAUSTED" },
    };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/laps", async (request, reply) => {
    if (options.store.getSession(request.params.id) === null) {
      return notFound(reply, "Session");
    }
    return options.store.listLaps(request.params.id);
  });

  app.get<{ Params: { lapId: string } }>("/api/laps/:lapId", async (request, reply) => {
    return options.store.getLap(request.params.lapId) ?? notFound(reply, "Lap");
  });

  app.get<{ Params: { id: string } }>("/api/evidence/:id", async (request, reply) => {
    return (
      options.store.readEvidenceContent(request.params.id)?.evidence ?? notFound(reply, "Evidence")
    );
  });

  app.get<{ Params: { id: string } }>("/api/evidence/:id/raw", async (request, reply) => {
    const stored = options.store.readEvidenceContent(request.params.id);
    if (stored === null) return notFound(reply, "Evidence");
    const type =
      stored.evidence.type === "SCREENSHOT" || stored.evidence.type === "CROP"
        ? "image/png"
        : stored.evidence.type === "DOM" || stored.evidence.type === "SNAPSHOT"
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";
    void reply
      .header("ETag", `"sha256-${stored.evidence.sha256}"`)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .type(type);
    return reply.send(stored.content);
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/live", async (request, reply) => {
    const session = options.store.getSession(request.params.id);
    if (session === null) return notFound(reply, "Session");
    const shots = options.store.listScreenshots(session.id);
    const shot = shots[0] ?? null;
    const events = options.store.listEvents(session.id);
    const latestEvidence = [...events].reverse().find((e) => e.type === "evidence.captured");
    const map = options.store.getCapabilityMap(session.id);
    return {
      live: session.input.live === true,
      status: session.status,
      latestScreenshotId: shot?.id ?? null,
      latestScreenshotUrl: shot !== null ? `/api/evidence/${shot.id}/raw` : null,
      latestLabel: shot?.label ?? null,
      latestEvidencePayload: latestEvidence?.payload ?? null,
      liveSessionsEnabled: liveSessions,
      screenshotCount: shots.length,
      stateCount: map?.states.length ?? 0,
      screenshots: shots.slice(0, 48).map((row) => ({
        id: row.id,
        url: `/api/evidence/${row.id}/raw`,
        label: row.label,
        capturedAt: row.capturedAt,
        pageUrl: typeof row.metadata.url === "string" ? row.metadata.url : null,
        action: typeof row.metadata.action === "string" ? row.metadata.action : null,
        phase: typeof row.metadata.phase === "string" ? row.metadata.phase : null,
      })),
    };
  });

  for (const path of [
    "/api/laps/:lapId/plans/:round",
    "/api/laps/:lapId/plans/:round.md",
    "/api/laps/:lapId/assessments/:round",
    "/api/runs/:runId",
    "/api/runs/:runId/steps/:stepId",
    "/api/diagnoses/:id",
    "/api/patches/:id",
    "/api/patches/:id.diff",
    "/api/sessions/:id/suite.zip",
  ]) {
    app.get(path, async (_request, reply) => notFound(reply, "Stubbed resource"));
  }

  function sessionReport(sessionId: string) {
    const inputPath = join(repositoryRoot, "artifacts", "sessions", sessionId, "report-input.json");
    if (existsSync(inputPath)) {
      return buildReport(JSON.parse(readFileSync(inputPath, "utf8")) as ReportInput);
    }
    // Demo fixture only for the curated demo session — never for real runs.
    if (sessionId === "ses_demo") {
      return buildReport(demoReportInput(sessionId));
    }
    const session = options.store.getSession(sessionId);
    if (session !== null) {
      return buildReport(
        stubReportInput(sessionId, {
          url: session.input.url,
          generatedAt: session.finishedAt ?? session.createdAt,
          reportId: options.context.ids.next("rpt"),
          capabilityId: options.context.ids.next("cap"),
          gapId: options.context.ids.next("gap"),
        }),
      );
    }
    return buildReport(demoReportInput(sessionId));
  }

  app.get<{ Params: { id: string } }>("/api/sessions/:id/report", async (request) => {
    return sessionReport(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/report.md", async (request, reply) => {
    const report = sessionReport(request.params.id);
    void reply.type("text/markdown; charset=utf-8");
    return renderMarkdown(report);
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/score", async (request) => {
    return sessionReport(request.params.id).score;
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/report.html", async (request, reply) => {
    const report = sessionReport(request.params.id);
    const md = renderMarkdown(report);
    // Thin HTML twin for print/download — dashboard owns the rich view.
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>FORGE Report · ${report.sessionId}</title><style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#202124}pre{white-space:pre-wrap}</style></head><body><pre>${md.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre></body></html>`;
    void reply.type("text/html; charset=utf-8");
    return html;
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/gates", async () => []);
  app.get<{ Params: { id: string } }>("/api/sessions/:id/escalations", async () => []);
  app.post("/api/gates/:gateId", async (_request, reply) => notFound(reply, "Gate"));
  app.post("/api/escalations/:id", async (_request, reply) => notFound(reply, "Escalation"));
  app.post("/api/sessions/:id/scenarios", async (_request, reply) =>
    reply.code(409).send({
      error: { code: "INVALID_STATE", message: "No active Copilot gate" },
    }),
  );

  app.get("/api/health", async () => ({ ok: true, liveSessions }));
  app.get("/api/doctor", async () => ({
    ok: true,
    bind: "127.0.0.1",
    persistence: "sqlite",
    liveSessions,
  }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed",
          issues: error.issues,
          requestId: request.id,
        },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL", message: "Internal server error", requestId: request.id },
    });
  });

  return app;
}

export async function listenForgeServer(
  app: FastifyInstance,
  port: number,
  host = "127.0.0.1",
): Promise<string> {
  return app.listen({ port, host });
}
