"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createSession,
  fetchLiveAvailability,
  fetchSessions,
  parseApplicationUrl,
  type SessionSummary,
} from "../lib/api";

function relativeTime(iso: string): string {
  const delta = globalThis.Date.now() - new globalThis.Date(iso).getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return new globalThis.Date(iso).toLocaleString();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [live, setLive] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SessionSummary[]>([]);

  const parsed = useMemo(() => parseApplicationUrl(url), [url]);
  const canSubmit = parsed.ok && !submitting;

  const loadRecent = useCallback(async () => {
    try {
      const sessions = await fetchSessions();
      setRecent(sessions.slice().reverse());
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
    void fetchLiveAvailability().then((available) => {
      setLiveAvailable(available);
      if (available) setLive(true);
    });
  }, [loadRecent]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const check = parseApplicationUrl(url);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = await createSession(check.url, { live: live && liveAvailable });
      router.push(`/s/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the session");
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <h1 className="brand">FORGE</h1>
      <p className="lede">
        Point it at a URL. It explores, plans, critiques, generates, runs, and tells you what it
        could not test.
      </p>

      <form className="start-form" onSubmit={onSubmit} noValidate>
        <label className="sr-only" htmlFor="target-url">
          Application URL
        </label>
        <input
          id="target-url"
          className="url-input"
          type="url"
          name="url"
          autoFocus
          autoComplete="url"
          placeholder="https://shop.test"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "url-error" : "url-hint"}
        />
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {submitting ? "Starting…" : "Start →"}
        </button>
      </form>

      <label className={`live-toggle ${liveAvailable ? "live-toggle-on" : ""}`}>
        <input
          type="checkbox"
          checked={live && liveAvailable}
          disabled={!liveAvailable}
          onChange={(e) => setLive(e.target.checked)}
        />
        <span>
          <strong>Live explore</strong>
          {liveAvailable
            ? " — open a real browser on this URL, screenshot each step, run explore → plan → run → report"
            : " — API live mode is off (set FORGE_LIVE_SESSIONS=true and restart the API)"}
        </span>
      </label>

      <p id="url-hint" className="field-hint">
        {live && liveAvailable
          ? "Live mode is on. FORGE will visit the URL for real. Uncheck Live explore for a fast stub demo."
          : "Stub mode only animates the pipeline and does not open the URL. Turn on Live explore to test for real."}
      </p>
      {error !== null && (
        <p id="url-error" className="field-error" role="alert">
          {error}
        </p>
      )}
      {!parsed.ok && url.trim().length > 8 && error === null && (
        <p className="field-hint warn">{parsed.reason}</p>
      )}

      <section className="recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent</h2>
        {recent.length === 0 ? (
          <p className="empty">No runs yet. Enter a URL above to generate your first report.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((session) => (
              <li key={session.id}>
                <a href={`/s/${session.id}`}>
                  <span className="recent-host">{hostOf(session.input.url)}</span>
                  <span className="recent-meta">
                    {session.input.live ? "live · " : ""}
                    {session.status}
                    {session.defectsFound > 0 ? ` · ${session.defectsFound} defect` : ""}
                    {" · "}
                    {relativeTime(session.createdAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="demo-link">
        Or open the <a href="/s/ses_demo/report">demo report</a> without starting a run.
      </p>
    </main>
  );
}
