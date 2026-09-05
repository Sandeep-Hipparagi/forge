import { z } from "zod";
import type { Browser, BrowserContext, Page } from "playwright";

export const ToolResult = <T,>(ok: boolean, data?: T, error?: string) => ({ ok, data, error });

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface BrowserToolContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  storageStatePath?: string;
}

export const NavigateParams = z.object({
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("domcontentloaded"),
  timeout: z.number().int().positive().default(30000),
});

export const ClickParams = z.object({
  selector: z.string(),
  timeout: z.number().int().positive().default(5000),
  force: z.boolean().default(false),
});

export const FillParams = z.object({
  selector: z.string(),
  value: z.string(),
  timeout: z.number().int().positive().default(5000),
});

export const SelectParams = z.object({
  selector: z.string(),
  value: z.string(),
  timeout: z.number().int().positive().default(5000),
});

export const SnapshotParams = z.object({});

export const GetDomFactsParams = z.object({});

export const PressParams = z.object({
  key: z.string(),
  timeout: z.number().int().positive().default(5000),
});

export const WaitForParams = z.object({
  selector: z.string(),
  state: z.enum(["attached", "detached", "visible", "hidden"]).default("visible"),
  timeout: z.number().int().positive().default(5000),
});

export const GoBackParams = z.object({});

export const GetStorageStateParams = z.object({});

export const SetStorageStateParams = z.object({
  path: z.string(),
});

export type NavigateParams = z.infer<typeof NavigateParams>;
export type ClickParams = z.infer<typeof ClickParams>;
export type FillParams = z.infer<typeof FillParams>;
export type SelectParams = z.infer<typeof SelectParams>;
export type SnapshotParams = z.infer<typeof SnapshotParams>;
export type GetDomFactsParams = z.infer<typeof GetDomFactsParams>;
export type PressParams = z.infer<typeof PressParams>;
export type WaitForParams = z.infer<typeof WaitForParams>;
export type GoBackParams = z.infer<typeof GoBackParams>;
export type GetStorageStateParams = z.infer<typeof GetStorageStateParams>;
export type SetStorageStateParams = z.infer<typeof SetStorageStateParams>;

export interface BrowserTools {
  navigate: (params: NavigateParams) => Promise<ToolResult<{ url: string; title: string }>>;
  click: (params: ClickParams) => Promise<ToolResult<{ action: string }>>;
  fill: (params: FillParams) => Promise<ToolResult<{ ok: boolean }>>;
  select: (params: SelectParams) => Promise<ToolResult<{ ok: boolean }>>;
  snapshot: (params: SnapshotParams) => Promise<ToolResult<any>>;
  getDomFacts: (params: GetDomFactsParams) => Promise<ToolResult<any>>;
  press: (params: PressParams) => Promise<ToolResult<{ ok: boolean }>>;
  waitFor: (params: WaitForParams) => Promise<ToolResult<{ ok: boolean }>>;
  goBack: (params: GoBackParams) => Promise<ToolResult<{ ok: boolean }>>;
  getStorageState: (params: GetStorageStateParams) => Promise<ToolResult<{ state: string }>>;
  setStorageState: (params: SetStorageStateParams) => Promise<ToolResult<{ ok: boolean }>>;
}

export function createBrowserTools(ctx: BrowserToolContext): BrowserTools {
  return {
    navigate: async ({ url, waitUntil, timeout }) => {
      try {
        await ctx.page.goto(url, { waitUntil, timeout });
        return { ok: true, data: { url: ctx.page.url(), title: await ctx.page.title() } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Navigation failed" };
      }
    },

    click: async ({ selector, timeout, force }) => {
      try {
        await ctx.page.click(selector, { timeout, force });
        return { ok: true, data: { action: "click" } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Click failed" };
      }
    },

    fill: async ({ selector, value, timeout }) => {
      try {
        await ctx.page.fill(selector, value, { timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Fill failed" };
      }
    },

    select: async ({ selector, value, timeout }) => {
      try {
        await ctx.page.selectOption(selector, value, { timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Select failed" };
      }
    },

    snapshot: async () => {
      try {
        const snapshot = await ctx.page.accessibility.snapshot({ root: ctx.page.mainFrame() });
        return { ok: true, data: snapshot };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Snapshot failed" };
      }
    },

    getDomFacts: async () => {
      try {
        const facts = await ctx.page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el, i) => ({
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            name: el.getAttribute("name"),
            id: el.id,
            autocomplete: el.getAttribute("autocomplete"),
            placeholder: el.getAttribute("placeholder"),
            accessibleName: el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el as HTMLInputElement).value,
            ref: `e${i}`,
          }));

          const forms = Array.from(document.querySelectorAll("form")).map((form, i) => {
            const formInputs = Array.from(form.querySelectorAll("input, select, textarea")).map(el => `e${i}`);
            const formButtons = Array.from(form.querySelectorAll("button, input[type=submit]")).map(el => `e${i}`);
            return {
              ref: `form_${i}`,
              action: form.getAttribute("action"),
              method: form.getAttribute("method"),
              inputs: formInputs,
              buttons: formButtons,
            };
          });

          const buttons = Array.from(document.querySelectorAll("button, a[role=button], input[type=button], input[type=submit]")).map((btn, i) => ({
            ref: `btn_${i}`,
            accessibleName: btn.textContent?.trim() || btn.getAttribute("aria-label") || btn.getAttribute("value"),
            role: btn.getAttribute("role") || btn.tagName.toLowerCase(),
            landmark: null,
          }));

          const landmarks = Array.from(document.querySelectorAll("[role=main], [role=navigation], [role=banner], [role=contentinfo], [role=complementary], [role=search], [role=region]")).map((lm, i) => ({
            role: lm.getAttribute("role") || "region",
            label: lm.getAttribute("aria-label") || lm.getAttribute("aria-labelledby"),
            refs: [`landmark_${i}`],
          }));

          return { inputs, forms, buttons, landmarks };
        });
        return { ok: true, data: facts };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Get DOM facts failed" };
      }
    },

    press: async ({ key, timeout }) => {
      try {
        await ctx.page.keyboard.press(key, { timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Press failed" };
      }
    },

    waitFor: async ({ selector, state, timeout }) => {
      try {
        await ctx.page.waitForSelector(selector, { state, timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Wait failed" };
      }
    },

    goBack: async () => {
      try {
        await ctx.page.goBack();
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Go back failed" };
      }
    },

    getStorageState: async () => {
      try {
        const state = await ctx.context.storageState();
        return { ok: true, data: { state: JSON.stringify(state) } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Get storage state failed" };
      }
    },

    setStorageState: async ({ path }) => {
      try {
        await ctx.context.clearCookies();
        const state = JSON.parse(await import("fs/promises").then(fs => fs.readFile(path, "utf-8")));
        await ctx.context.addCookies(state.cookies || []);
        await ctx.context.addInitScript(() => {});
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Set storage state failed" };
      }
    },
  };
}