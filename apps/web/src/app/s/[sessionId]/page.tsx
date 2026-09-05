"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchEvents,
  fetchLivePreview,
  fetchSession,
  isTerminal,
  type LivePreview,
  type SessionEvent,
  type SessionSummary,
} from "../../../lib/api";
import { buildPipeline, statusLabel, type PipelineStep } from "../../../lib/pipeline";

const DEMO_VIDEO_URL = process.env.NEXT_PUBLIC_FORGE_DEMO_VIDEO_URL ?? "";

function glyph(status: PipelineStep["status"]): string {
  if (status === "done") return "✓";
  if (status === "active") return "◉";
  if (status === "error") return "⚠";
  if (status === "skipped") return "–";
  return "○";
}

function formatTime(iso: string | null): string {
  if (iso === null) return "";
  try {
    return new globalThis.Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transport, setTransport] = useState<"sse" | "polling" | "idle">("idle");
  const [visibleCount, setVisibleCount] = useState(0);
  const [preview, setPreview] = useState<LivePreview | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [followLive, setFollowLive] = useState(true);

  useEffect(() => {
    void params.then(({ sessionId: id }) => setSessionId(id));
  }, [params]);

  const refresh = useCallback(async (id: string, since: number) => {
    const [nextSession, eventPage] = await Promise.all([fetchSession(id), fetchEvents(id, since)]);
    if (nextSession === null) {
      setError("Session was not found");
      return { terminal: true, nextSince: since };
    }
    setSession(nextSession);
    if (eventPage.events.length > 0) {
      setEvents((prev) => {
        const bySeq = new Map(prev.map((e) => [e.seq, e]));
        for (const event of eventPage.events) bySeq.set(event.seq, event);
        return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
      });
    }
    return {
      terminal: isTerminal(nextSession.status),
      nextSince: eventPage.nextSince,
    };
  }, []);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;

    async function pollPreview() {
      const next = await fetchLivePreview(sessionId!);
      if (cancelled || next === null) return;
      setPreview(next);
      if (next.latestScreenshotId !== null) {
        setSelectedShotId((current) => {
          if (followLive || current === null) return next.latestScreenshotId;
          const stillThere = next.screenshots?.some((s) => s.id === current);
          return stillThere ? current : next.latestScreenshotId;
        });
      }
    }

    void pollPreview();
    const timer = setInterval(() => void pollPreview(), 800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, followLive]);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    let since = -1;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | null = null;

    async function boot() {
      try {
        const result = await refresh(sessionId!, since);
        if (cancelled) return;
        since = result.nextSince;
        if (result.terminal) {
          setTransport("idle");
          return;
        }

        // Polling is the default live path. Venue proxies often buffer SSE through Next rewrites;
        // EventSource is still opened best-effort for low latency when it works.
        setTransport("polling");
        pollTimer = setInterval(() => {
          void refresh(sessionId!, since).then((next) => {
            since = next.nextSince;
            if (next.terminal && pollTimer !== undefined) {
              clearInterval(pollTimer);
              setTransport("idle");
            }
          });
        }, 500);

        const ingest = (raw: MessageEvent<string>) => {
          try {
            const event = JSON.parse(raw.data) as SessionEvent;
            setEvents((prev) => {
              if (prev.some((e) => e.seq === event.seq)) return prev;
              return [...prev, event].sort((a, b) => a.seq - b.seq);
            });
            since = Math.max(since, event.seq);
            if (event.type === "session.finished") {
              void refresh(sessionId!, since);
              source?.close();
              if (pollTimer !== undefined) clearInterval(pollTimer);
              setTransport("idle");
            } else {
              setTransport("sse");
            }
          } catch {
            /* ignore malformed */
          }
        };

        source = new EventSource(`/api/sessions/${sessionId}/stream`);
        // API sets named `event:` fields — register each type (onmessage alone never fires).
        for (const type of [
          "session.started",
          "explore.state",
          "explore.finished",
          "capabilities.ranked",
          "lap.started",
          "plan.drafted",
          "critique.finished",
          "critique.replan",
          "generate.validated",
          "generate.dropped",
          "run.started",
          "step.finished",
          "triage.finished",
          "heal.decided",
          "verify.finished",
          "lap.banked",
          "report.generated",
          "session.finished",
          "evidence.captured",
        ]) {
          source.addEventListener(type, ingest as EventListener);
        }
        source.onmessage = ingest;
        source.onerror = () => {
          source?.close();
          source = null;
          setTransport("polling");
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load session");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
      source?.close();
      if (pollTimer !== undefined) clearInterval(pollTimer);
    };
  }, [sessionId, refresh]);

  const steps = useMemo(() => {
    if (session === null) return [];
    return buildPipeline(session.status, events);
  }, [session, events]);

  // Presentational stagger — never gates real progress (18 §2.4).
  useEffect(() => {
    if (steps.length === 0) return;
    const doneOrActive = steps.filter((s) => s.status !== "pending").length;
    const target = Math.max(doneOrActive, 1);
    if (visibleCount >= target) {
      setVisibleCount(target);
      return;
    }
    const timer = setTimeout(() => setVisibleCount((n) => Math.min(n + 1, target)), 80);
    return () => clearTimeout(timer);
  }, [steps, visibleCount]);

  useEffect(() => {
    setVisibleCount(0);
  }, [sessionId]);

  if (sessionId === null) {
    return (
      <main className="shell">
        <p className="lede">Loading session…</p>
      </main>
    );
  }

  if (error !== null && session === null) {
    return (
      <main className="shell">
        <nav className="nav">
          <a href="/">← Start</a>
        </nav>
        <h1 className="brand">Session unavailable</h1>
        <p className="lede">{error}</p>
      </main>
    );
  }

  const terminal = session !== null && isTerminal(session.status);
  const host = session?.input.url ?? sessionId;
  const shots = preview?.screenshots ?? [];
  const selected =
    shots.find((s) => s.id === selectedShotId) ??
    (preview?.latestScreenshotUrl
      ? {
          id: preview.latestScreenshotId ?? "latest",
          url: preview.latestScreenshotUrl,
          label: preview.latestLabel ?? "Latest",
          capturedAt: "",
          pageUrl: null,
          action: null,
          phase: null,
        }
      : null);

  return (
    <main className="shell session-shell">
      <nav className="nav">
        <a href="/">← Start</a>
        {terminal && (
          <a href={`/s/${sessionId}/report`} data-testid="open-report">
            Open report →
          </a>
        )}
      </nav>

      <header className="session-header">
        <div>
          <h1 className="session-title">{host}</h1>
          <p className="session-sub mono">{sessionId}</p>
        </div>
        <div className="session-status" data-testid="session-status">
          <span className={`status-chip status-${(session?.status ?? "CREATED").toLowerCase()}`}>
            {session ? statusLabel(session.status) : "Loading"}
          </span>
          {transport === "polling" && <span className="transport-dot">reconnecting</span>}
          {transport === "sse" && <span className="transport-dot live">live</span>}
        </div>
      </header>

      <section className="session-grid" aria-label="Session progress">
        <section className="panel pipeline-panel" aria-labelledby="pipeline-heading">
          <h2 id="pipeline-heading">Report pipeline</h2>
          <p className="pipeline-intro">
            Every stage that produces the quality report, in order. Rows append as FORGE decides.
          </p>
          <ol className="pipeline" aria-live="polite" data-testid="pipeline">
            {steps.map((step, index) => {
              const shown = index < visibleCount || step.status === "pending";
              if (!shown && step.status !== "pending") return null;
              const reveal = index < visibleCount;
              return (
                <li
                  key={step.id}
                  className={`pipeline-row status-${step.status} ${reveal ? "in" : ""}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                  data-testid={`step-${step.id}`}
                  data-status={step.status}
                >
                  <span className="pipeline-glyph" aria-hidden>
                    {glyph(step.status)}
                  </span>
                  <div className="pipeline-body">
                    <div className="pipeline-label-row">
                      <strong>{step.label}</strong>
                      {step.eventType !== null && (
                        <span className="pipeline-event mono">{step.eventType}</span>
                      )}
                    </div>
                    <p>{step.detail}</p>
                  </div>
                  <span className="pipeline-time mono">{formatTime(step.at)}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {(preview?.live || (preview?.screenshotCount ?? 0) > 0) && (
          <aside
            className="panel live-panel"
            aria-labelledby="live-heading"
            data-testid="live-view"
          >
            <div className="live-heading-row">
              <h2 id="live-heading">Live trail</h2>
              <span className="live-count mono" data-testid="shot-count">
                {preview?.screenshotCount ?? 0} shots
                {preview?.stateCount ? ` · ${preview.stateCount} states` : ""}
              </span>
            </div>
            <p className="pipeline-intro">
              {selected?.label ?? "Waiting for the agent to open the first page…"}
            </p>
            {DEMO_VIDEO_URL && (
              <p className="lede-small">
                End-to-end demo video (same footage for every run):{" "}
                <a href={DEMO_VIDEO_URL} target="_blank" rel="noreferrer">
                  Watch how screenshots are captured →
                </a>
              </p>
            )}
            {selected !== null ? (
              <img
                key={selected.id}
                className="live-shot"
                src={selected.url}
                alt={selected.label}
              />
            ) : (
              <div className="live-shot-placeholder">Opening the target…</div>
            )}
            {shots.length > 0 && (
              <div className="shot-strip" data-testid="shot-strip" role="list">
                {[...shots].reverse().map((shot, index) => (
                  <button
                    key={shot.id}
                    type="button"
                    role="listitem"
                    className={`shot-thumb ${shot.id === selected?.id ? "active" : ""}`}
                    onClick={() => {
                      setFollowLive(false);
                      setSelectedShotId(shot.id);
                    }}
                    title={shot.label}
                  >
                    <img src={shot.url} alt="" />
                    <span className="shot-index">{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            {!followLive && (
              <button
                type="button"
                className="btn live-follow"
                onClick={() => {
                  setFollowLive(true);
                  if (preview?.latestScreenshotId) setSelectedShotId(preview.latestScreenshotId);
                }}
              >
                Follow live →
              </button>
            )}
          </aside>
        )}
      </section>

      {terminal && session !== null && (
        <div className="panel finish-card" data-testid="pipeline-complete">
          <h2>Report ready</h2>
          <p>
            Status <strong>{statusLabel(session.status)}</strong>
            {session.defectsFound > 0 ? ` · ${session.defectsFound} defect(s) found` : ""}. Audit
            the score, healer actions, and residual gaps on the report screen.
          </p>
          <a className="btn btn-primary" href={`/s/${sessionId}/report`}>
            View quality report →
          </a>
        </div>
      )}

      {events.length > 0 && (
        <details className="event-log">
          <summary>Event log ({events.length})</summary>
          <ul className="event-list mono">
            {events.map((event) => (
              <li key={event.seq}>
                <span className="event-seq">{event.seq}</span> {event.type}
                <span className="event-actor"> · {event.actor}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
