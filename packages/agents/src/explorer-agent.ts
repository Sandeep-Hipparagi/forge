import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import {
  createBrowserTools,
  type BrowserToolContext,
} from "./browser-tools.js";
import {
  explore,
  type AgentContext as ExplorerContext,
  type ExplorerInput,
  type ExplorerOutput,
  type AccessibilitySnapshot,
  type DomFacts,
} from "@forge/perception";

export interface AgentContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  storageStatePath?: string;
}

const emptySnapshot = (): AccessibilitySnapshot => ({
  url: "about:blank",
  title: "",
  timestamp: "1970-01-01T00:00:00.000Z",
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  nodes: [],
  metadata: { interactivesCount: 0, interactivesDropped: 0 },
});

const emptyDomFacts = (): DomFacts => ({
  inputs: [],
  forms: [],
  buttons: [],
  landmarks: [],
});

function makeExplorerContext(toolCtx: BrowserToolContext): ExplorerContext {
  const tools = createBrowserTools(toolCtx);
  return {
    navigate: async (url: string) => {
      await tools.navigate({
        url,
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    },
    click: async (ref: string) => {
      const result = await tools.click({
        selector: ref,
        timeout: 5000,
        force: false,
      });
      return result.ok
        ? { ok: true, action: result.data.action }
        : { ok: false, action: "click", error: result.error };
    },
    fill: async (ref: string, value: string) => {
      const result = await tools.fill({ selector: ref, value, timeout: 5000 });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    select: async (ref: string, value: string) => {
      const result = await tools.select({
        selector: ref,
        value,
        timeout: 5000,
      });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    back: async () => {
      await tools.goBack({});
    },
    snapshot: async () => {
      const result = await tools.snapshot({});
      return result.ok && result.data
        ? (result.data as AccessibilitySnapshot)
        : emptySnapshot();
    },
    getDomFacts: async () => {
      const result = await tools.getDomFacts({});
      return result.ok && result.data
        ? (result.data as DomFacts)
        : emptyDomFacts();
    },
    getStorageState: async () => {
      const result = await tools.getStorageState({});
      return result.ok ? result.data.state : "{}";
    },
    setStorageState: async (state: string) => {
      await tools.setStorageState({ path: state });
    },
    now: () => performance.timeOrigin + performance.now(),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export async function runExplorerAgent(
  input: ExplorerInput,
): Promise<ExplorerOutput> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    return await explore(
      input,
      makeExplorerContext({ browser, context, page }),
    );
  } finally {
    await browser.close();
  }
}

export async function runExplorerAgentWithBrowser(
  input: ExplorerInput,
  browser: Browser,
): Promise<ExplorerOutput> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    return await explore(
      input,
      makeExplorerContext({ browser, context, page }),
    );
  } finally {
    await context.close();
  }
}
