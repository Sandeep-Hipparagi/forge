import { chromium, Browser, BrowserContext, Page } from "playwright";
import { createBrowserTools, type BrowserToolContext, type BrowserTools } from "./browser-tools.js";
import { explore, type ExplorerInput, type ExplorerOutput } from "@forge/perception";

export interface AgentContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  storageStatePath?: string;
}

export async function runExplorerAgent(input: ExplorerInput): Promise<ExplorerOutput> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const toolCtx: BrowserToolContext = { browser, context, page, storageStatePath: input.credentials ? "/tmp/storage.json" : undefined };
    const tools = createBrowserTools(toolCtx);

    const agentCtx = {
      navigate: async (url: string) => {
        const result = await tools.navigate({ url });
        if (!result.ok) throw new Error(result.error);
      },
      click: async (ref: string) => {
        const result = await tools.click({ selector: ref });
        return result;
      },
      fill: async (ref: string, value: string) => {
        const result = await tools.fill({ selector: ref, value });
        return result;
      },
      select: async (ref: string, value: string) => {
        const result = await tools.select({ selector: ref, value });
        return result;
      },
      back: async () => {
        const result = await tools.goBack({});
        return result;
      },
      snapshot: async () => {
        const result = await tools.snapshot({});
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      getDomFacts: async () => {
        const result = await tools.getDomFacts({});
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      getStorageState: async () => {
        const result = await tools.getStorageState({});
        if (!result.ok) throw new Error(result.error);
        return result.data.state;
      },
      setStorageState: async (state: string) => {
        const result = await tools.setStorageState({ path: state });
        return result;
      },
    };

    const result = await explore(input, agentCtx);
    return result;
  } finally {
    await browser.close();
  }
}

export async function runExplorerAgentWithBrowser(
  input: ExplorerInput,
  browser: Browser
): Promise<ExplorerOutput> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    const toolCtx: BrowserToolContext = { browser, context, page };
    const tools = createBrowserTools(toolCtx);

    const agentCtx = {
      navigate: async (url: string) => {
        const result = await tools.navigate({ url });
        if (!result.ok) throw new Error(result.error);
      },
      click: async (ref: string) => {
        const result = await tools.click({ selector: ref });
        return result;
      },
      fill: async (ref: string, value: string) => {
        const result = await tools.fill({ selector: ref, value });
        return result;
      },
      select: async (ref: string, value: string) => {
        const result = await tools.select({ selector: ref, value });
        return result;
      },
      back: async () => {
        const result = await tools.goBack({});
        return result;
      },
      snapshot: async () => {
        const result = await tools.snapshot({});
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      getDomFacts: async () => {
        const result = await tools.getDomFacts({});
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      getStorageState: async () => {
        const result = await tools.getStorageState({});
        if (!result.ok) throw new Error(result.error);
        return result.data.state;
      },
      setStorageState: async (state: string) => {
        const result = await tools.setStorageState({ path: state });
        return result;
      },
    };

    const result = await explore(input, agentCtx);
    return result;
  } finally {
    await context.close();
  }
}