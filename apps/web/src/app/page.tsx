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

function presetTargets(): Array<{ id: string; label: string; url: string; hint?: string }> {
  return [
    {
      id: "aperture",
      label: "Aperture (local demo)",
      url: "http://localhost:4100/",
      hint: "Bundled demo app when running the full Forge demo stack",
    },
    {
      id: "saucedemo",
      label: "SauceDemo (login demo shop)",
      url: "https://www.saucedemo.com/",
      hint: "Public login-gated demo shop — bring your own credentials",
    },
  ];
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState<"full" | "login" | "explore">("full");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SessionSummary[]>([]);

  const parsed = useMemo(() => parseApplicationUrl(url), [url]);
  const canSubmit = parsed.ok && !submitting;
  const hasCredentials = username.trim().length > 0 || password.length > 0;

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
      const intentPrefix =
        mode === "login" ? "[mode: login-only]" : mode === "explore" ? "[mode: explore-only]" : "";
      const trimmedIntent = intent.trim();
      const combinedIntent =
        intentPrefix && trimmedIntent.length > 0
          ? `${intentPrefix} ${trimmedIntent}`
          : intentPrefix || trimmedIntent;
      const session = await createSession(check.url, {
        live: live && liveAvailable,
        ...(username.trim().length > 0 ? { username: username.trim() } : {}),
        ...(password.length > 0 ? { password } : {}),
        ...(combinedIntent.length > 0 ? { intent: combinedIntent } : {}),
      });
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

      <div className="preset-row">
        <span className="preset-label">Examples:</span>
        {presetTargets().map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-button"
            onClick={() => {
              setUrl(preset.url);
              setError(null);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <details
        className="optional-drawer"
        open={optionsOpen}
        onToggle={(e) => setOptionsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          Optional — sign-in, what to focus on
          {hasCredentials ? " · credentials set" : ""}
        </summary>
        <div className="optional-fields">
          <label htmlFor="username">
            Username
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="demo_user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label htmlFor="password">
            Password
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="optional-intent" htmlFor="intent">
            Focus (optional)
            <input
              id="intent"
              name="intent"
              type="text"
              placeholder="e.g. checkout and cart"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </label>
          <fieldset className="optional-mode">
            <legend>Test mode</legend>
            <div className="optional-mode-grid">
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="full"
                  checked={mode === "full"}
                  onChange={() => setMode("full")}
                />
                <span>
                  <strong>Full run</strong>
                  <span>Explore → plan → run → report</span>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="login"
                  checked={mode === "login"}
                  onChange={() => setMode("login")}
                />
                <span>
                  <strong>Login smoke</strong>
                  <span>Quickly check sign-in works with these credentials</span>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="explore"
                  checked={mode === "explore"}
                  onChange={() => setMode("explore")}
                />
                <span>
                  <strong>Explore only</strong>
                  <span>Map states and flows; treat intent as guidance</span>
                </span>
              </label>
            </div>
          </fieldset>
          <p className="field-hint">
            Credentials are used once to sign in, then discarded. They are never stored in the
            session, events, or screenshots metadata.
          </p>
        </div>
      </details>

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
            ? " — open a real browser, sign in if credentials are set, screenshot each step, run explore → plan → run → report"
            : " — API live mode is off (set FORGE_LIVE_SESSIONS=true and restart the API)"}
        </span>
      </label>

      <p id="url-hint" className="field-hint">
        {live && liveAvailable
          ? hasCredentials
            ? "Live mode is on with sign-in. FORGE will log in, crawl the app, and capture screenshots for every step."
            : "Live mode is on. FORGE will visit the URL for real. Add credentials above if the app requires login."
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
                    {session.authenticated ? "signed in · " : ""}
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
