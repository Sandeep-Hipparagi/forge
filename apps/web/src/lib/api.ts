/** Browser calls go through Next rewrites (`/api/*` → API). Server components use the absolute origin. */
export const API_ORIGIN =
  typeof window === "undefined" ? (process.env.FORGE_API_URL ?? "http://127.0.0.1:4000") : "";

export type SessionStatus =
  | "CREATED"
  | "EXPLORING"
  | "PRIORITISING"
  | "LAPPING"
  | "REPORTING"
  | "COMPLETED"
  | "COMPLETED_PARTIAL"
  | "ESCALATED"
  | "ERROR";

export type SessionSummary = {
  id: string;
  status: SessionStatus;
  input: { url: string; mode?: string; intent?: string; live?: boolean; username?: string };
  authenticated?: boolean;
  defectsFound: number;
  createdAt: string;
  finishedAt: string | null;
  stream: string;
  currentLapIndex?: number | null;
  backlogLength?: number;
  bankedCount?: number;
};

export type SessionEvent = {
  seq: number;
  sessionId: string;
  lapId: string | null;
  at: string;
  actor: string;
  type: string;
  payload: Record<string, unknown>;
};

export type ApiErrorBody = {
  error?: { code?: string; message?: string; requestId?: string };
};

function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

export async function createSession(
  url: string,
  options: {
    live?: boolean;
    username?: string;
    password?: string;
    intent?: string;
  } = {},
): Promise<SessionSummary> {
  const response = await fetch(apiUrl("/api/sessions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": globalThis.crypto.randomUUID(),
    },
    body: JSON.stringify({
      url,
      live: options.live === true,
      ...(options.username !== undefined && options.username.length > 0
        ? { username: options.username }
        : {}),
      ...(options.password !== undefined && options.password.length > 0
        ? { password: options.password }
        : {}),
      ...(options.intent !== undefined && options.intent.length > 0
        ? { intent: options.intent }
        : {}),
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error?.message ?? `Could not start session (${response.status})`);
  }
  return (await response.json()) as SessionSummary;
}

export type LiveScreenshot = {
  id: string;
  url: string;
  label: string;
  capturedAt: string;
  pageUrl: string | null;
  action: string | null;
  phase: string | null;
};

export type LivePreview = {
  live: boolean;
  status: SessionStatus;
  latestScreenshotId: string | null;
  latestScreenshotUrl: string | null;
  latestLabel: string | null;
  latestEvidencePayload: Record<string, unknown> | null;
  liveSessionsEnabled: boolean;
  screenshotCount?: number;
  stateCount?: number;
  screenshots?: LiveScreenshot[];
};

export async function fetchLivePreview(sessionId: string): Promise<LivePreview | null> {
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}/live`), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return (await response.json()) as LivePreview;
}

export async function fetchLiveAvailability(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/api/health"), { cache: "no-store" });
    if (!response.ok) return false;
    const body = (await response.json()) as { liveSessions?: boolean };
    return body.liveSessions === true;
  } catch {
    return false;
  }
}

export async function fetchSession(sessionId: string): Promise<SessionSummary | null> {
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}`), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Session fetch failed (${response.status})`);
  return (await response.json()) as SessionSummary;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch(apiUrl("/api/sessions"), { cache: "no-store" });
  if (!response.ok) return [];
  const body = (await response.json()) as { sessions: SessionSummary[] };
  return body.sessions ?? [];
}

export async function fetchEvents(
  sessionId: string,
  since = -1,
): Promise<{ events: SessionEvent[]; nextSince: number; hasMore: boolean }> {
  const response = await fetch(
    apiUrl(`/api/sessions/${sessionId}/events?since=${since}&limit=500`),
    {
      cache: "no-store",
    },
  );
  if (!response.ok) {
    return { events: [], nextSince: since, hasMore: false };
  }
  return (await response.json()) as {
    events: SessionEvent[];
    nextSince: number;
    hasMore: boolean;
  };
}

export function isTerminal(status: SessionStatus): boolean {
  return (
    status === "COMPLETED" ||
    status === "COMPLETED_PARTIAL" ||
    status === "ESCALATED" ||
    status === "ERROR"
  );
}

export function parseApplicationUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Enter an application URL" };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: "Only http(s) URLs are allowed" };
    }
    if (!url.hostname) {
      return { ok: false, reason: "URL must include a hostname" };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, reason: "That does not look like a valid URL" };
  }
}
