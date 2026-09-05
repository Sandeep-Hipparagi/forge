import { join } from "node:path";
import type { ForgeStore } from "@forge/store";
import {
  closeExplorationBrowser,
  loginOnce,
  openExplorationBrowser,
  type Credentials,
  type ExplorationBrowser,
} from "@forge/runner";

export type AuthenticateResult = {
  authenticated: boolean;
  storageStatePath: string | null;
  reason: string;
  loginAttempts: number;
};

/**
 * Authenticate once for a session, persist storageState via the store, and
 * mark Session.authenticated. Subsequent calls with an existing
 * storageStatePath skip the interactive login entirely (FR-102).
 *
 * Credentials stay in memory only — never written to the session row.
 */
export async function authenticateSession(options: {
  store: ForgeStore;
  sessionId: string;
  credentials: Credentials | null | undefined;
  entryUrl: string;
  /** Optional existing browser; when omitted a fresh one is launched and closed. */
  browser?: ExplorationBrowser;
  headless?: boolean;
}): Promise<AuthenticateResult> {
  const session = options.store.getSession(options.sessionId);
  if (session === null) {
    return {
      authenticated: false,
      storageStatePath: null,
      reason: "SESSION_NOT_FOUND",
      loginAttempts: 0,
    };
  }

  // Already authenticated — reuse the persisted storageState, never re-login.
  if (session.storageStatePath) {
    return {
      authenticated: session.authenticated,
      storageStatePath: session.storageStatePath,
      reason: "REUSED_STORAGE_STATE",
      loginAttempts: 0,
    };
  }

  if (!options.credentials?.username || !options.credentials.password) {
    options.store.setAuthenticated(options.sessionId, false);
    return {
      authenticated: false,
      storageStatePath: null,
      reason: "NO_CREDENTIALS",
      loginAttempts: 0,
    };
  }

  const owned = options.browser === undefined;
  let handle: ExplorationBrowser;

  if (options.browser !== undefined) {
    handle = options.browser;
  } else {
    const opened = await openExplorationBrowser({
      ...(options.headless !== undefined ? { headless: options.headless } : {}),
    });
    if (!opened.ok) {
      return {
        authenticated: false,
        storageStatePath: null,
        reason: opened.error.message,
        loginAttempts: 0,
      };
    }
    handle = opened.data;
  }

  try {
    await handle.page.goto(options.entryUrl, { waitUntil: "domcontentloaded" });
    const result = await loginOnce(handle.page, options.credentials, {
      entryUrl: options.entryUrl,
    });

    if (!result.ok) {
      options.store.setAuthenticated(options.sessionId, false);
      return {
        authenticated: false,
        storageStatePath: null,
        reason: result.error.message,
        loginAttempts: 0,
      };
    }

    if (result.data.status !== "authenticated") {
      options.store.setAuthenticated(options.sessionId, false);
      return {
        authenticated: false,
        storageStatePath: null,
        reason: result.data.reason,
        loginAttempts: result.data.loginAttempts,
      };
    }

    const browserHandle = handle;
    const storageStatePath = await options.store.ensureStorageState(options.sessionId, () =>
      browserHandle.context.storageState(),
    );
    options.store.setAuthenticated(options.sessionId, true);

    return {
      authenticated: true,
      storageStatePath,
      reason: "AUTHENTICATED",
      loginAttempts: result.data.loginAttempts,
    };
  } finally {
    if (owned) {
      await closeExplorationBrowser(handle);
    }
  }
}

/**
 * Resolve a session-relative storageState path for Playwright's
 * `browser.newContext({ storageState })`.
 */
export function absoluteStorageStatePath(repositoryRoot: string, relativePath: string): string {
  return join(repositoryRoot, relativePath);
}
