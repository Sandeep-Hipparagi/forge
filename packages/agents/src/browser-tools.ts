import { z } from "zod";
import type { Browser, BrowserContext, Page, Locator } from "playwright";

export const ToolResult = <T>(ok: boolean, data?: T, error?: string) => ({
  ok,
  data,
  error,
});

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface BrowserToolContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  storageStatePath?: string;
}

export const NavigateParams = z.object({
  url: z.string().url(),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle"])
    .default("domcontentloaded"),
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
  state: z
    .enum(["attached", "detached", "visible", "hidden"])
    .default("visible"),
  timeout: z.number().int().positive().default(5000),
});

export const GoBackParams = z.object({});

export const GetStorageStateParams = z.object({});

export const SetStorageStateParams = z.object({
  path: z.string(),
});

export type NavigateParams = z.input<typeof NavigateParams>;
export type ClickParams = z.input<typeof ClickParams>;
export type FillParams = z.input<typeof FillParams>;
export type SelectParams = z.input<typeof SelectParams>;
export type SnapshotParams = z.input<typeof SnapshotParams>;
export type GetDomFactsParams = z.input<typeof GetDomFactsParams>;
export type PressParams = z.input<typeof PressParams>;
export type WaitForParams = z.input<typeof WaitForParams>;
export type GoBackParams = z.input<typeof GoBackParams>;
export type GetStorageStateParams = z.input<typeof GetStorageStateParams>;
export type SetStorageStateParams = z.input<typeof SetStorageStateParams>;

export interface BrowserTools {
  navigate: (
    params: NavigateParams,
  ) => Promise<ToolResult<{ url: string; title: string }>>;
  click: (params: ClickParams) => Promise<ToolResult<{ action: string }>>;
  fill: (params: FillParams) => Promise<ToolResult<{ ok: boolean }>>;
  select: (params: SelectParams) => Promise<ToolResult<{ ok: boolean }>>;
  snapshot: (params?: SnapshotParams) => Promise<ToolResult<unknown>>;
  getDomFacts: (params?: GetDomFactsParams) => Promise<ToolResult<unknown>>;
  press: (params: PressParams) => Promise<ToolResult<{ ok: boolean }>>;
  waitFor: (params: WaitForParams) => Promise<ToolResult<{ ok: boolean }>>;
  goBack: (params?: GoBackParams) => Promise<ToolResult<{ ok: boolean }>>;
  getStorageState: (
    params?: GetStorageStateParams,
  ) => Promise<ToolResult<{ state: string }>>;
  setStorageState: (
    params: SetStorageStateParams,
  ) => Promise<ToolResult<{ ok: boolean }>>;
}

export function createBrowserTools(ctx: BrowserToolContext): BrowserTools {
  type RefDescriptor = { role: string; name: string | null };
  const refs = new Map<string, RefDescriptor>();
  const resolveLocator = (selector: string): Locator => {
    const descriptor = refs.get(selector);
    if (!descriptor) return ctx.page.locator(selector);
    const name = descriptor.name ?? undefined;
    switch (descriptor.role.toLowerCase()) {
      case "button":
        return ctx.page.getByRole("button", name ? { name } : undefined);
      case "link":
        return ctx.page.getByRole("link", name ? { name } : undefined);
      case "textbox":
      case "searchbox":
        return ctx.page.getByRole("textbox", name ? { name } : undefined);
      case "checkbox":
        return ctx.page.getByRole("checkbox", name ? { name } : undefined);
      case "radio":
        return ctx.page.getByRole("radio", name ? { name } : undefined);
      case "combobox":
        return ctx.page.getByRole("combobox", name ? { name } : undefined);
      case "tab":
        return ctx.page.getByRole("tab", name ? { name } : undefined);
      case "menuitem":
        return ctx.page.getByRole("menuitem", name ? { name } : undefined);
      default:
        return ctx.page.locator(selector);
    }
  };

  return {
    navigate: async (params) => {
      try {
        const { url, waitUntil, timeout } = NavigateParams.parse(params);
        await ctx.page.goto(url, { waitUntil, timeout });
        return {
          ok: true,
          data: { url: ctx.page.url(), title: await ctx.page.title() },
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Navigation failed",
        };
      }
    },

    click: async (params) => {
      try {
        const { selector, timeout, force } = ClickParams.parse(params);
        await resolveLocator(selector).click({ timeout, force });
        return { ok: true, data: { action: "click" } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Click failed",
        };
      }
    },

    fill: async (params) => {
      try {
        const { selector, value, timeout } = FillParams.parse(params);
        await resolveLocator(selector).fill(value, { timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Fill failed",
        };
      }
    },

    select: async (params) => {
      try {
        const { selector, value, timeout } = SelectParams.parse(params);
        await resolveLocator(selector).selectOption(value, { timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Select failed",
        };
      }
    },

    snapshot: async () => {
      try {
        const snapshot = await ctx.page.accessibility.snapshot();
        const descriptors = await ctx.page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              "button, a, input, select, textarea, [role]",
            ),
          ).map((el) => ({
            role:
              el.getAttribute("role") ||
              (el.tagName === "A"
                ? "link"
                : el.tagName.toLowerCase() === "button"
                  ? "button"
                  : "textbox"),
            name:
              el.getAttribute("aria-label") ||
              el.textContent?.trim() ||
              (el as HTMLInputElement).value ||
              null,
          })),
        );
        refs.clear();
        descriptors.forEach((descriptor, index) =>
          refs.set(`e${index}`, descriptor),
        );
        return { ok: true, data: snapshot };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Snapshot failed",
        };
      }
    },

    getDomFacts: async () => {
      try {
        const facts = await ctx.page.evaluate(() => {
          const refByElement = new WeakMap<Element, string>();
          const interactive = Array.from(
            document.querySelectorAll(
              "button, a, input, select, textarea, [role]",
            ),
          );
          interactive.forEach((el, i) => refByElement.set(el, `e${i}`));
          const ref = (el: Element): string =>
            refByElement.get(el) ?? `e${interactive.indexOf(el)}`;
          const inputs = Array.from(
            document.querySelectorAll("input, select, textarea"),
          ).map((el) => ({
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            name: el.getAttribute("name"),
            id: el.id,
            autocomplete: el.getAttribute("autocomplete"),
            placeholder: el.getAttribute("placeholder"),
            accessibleName:
              el.getAttribute("aria-label") ||
              el.getAttribute("aria-labelledby") ||
              (el as HTMLInputElement).value,
            ref: ref(el),
          }));

          const forms = Array.from(document.querySelectorAll("form")).map(
            (form, i) => {
              const formInputs = Array.from(
                form.querySelectorAll("input, select, textarea"),
              ).map((el) => ref(el));
              const formButtons = Array.from(
                form.querySelectorAll("button, input[type=submit]"),
              ).map((el) => ref(el));
              return {
                ref: `form_${i}`,
                action: form.getAttribute("action"),
                method: form.getAttribute("method"),
                inputs: formInputs,
                buttons: formButtons,
              };
            },
          );

          const buttons = Array.from(
            document.querySelectorAll(
              "button, a[role=button], input[type=button], input[type=submit]",
            ),
          ).map((btn) => ({
            ref: ref(btn),
            accessibleName:
              btn.textContent?.trim() ||
              btn.getAttribute("aria-label") ||
              btn.getAttribute("value"),
            role: btn.getAttribute("role") || btn.tagName.toLowerCase(),
            landmark: null,
          }));

          const landmarks = Array.from(
            document.querySelectorAll(
              "[role=main], [role=navigation], [role=banner], [role=contentinfo], [role=complementary], [role=search], [role=region]",
            ),
          ).map((lm, i) => ({
            role: lm.getAttribute("role") || "region",
            label:
              lm.getAttribute("aria-label") ||
              lm.getAttribute("aria-labelledby"),
            refs: [`landmark_${i}`],
          }));

          return { inputs, forms, buttons, landmarks };
        });
        return { ok: true, data: facts };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Get DOM facts failed",
        };
      }
    },

    press: async (params) => {
      try {
        const { key } = PressParams.parse(params);
        await ctx.page.keyboard.press(key);
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Press failed",
        };
      }
    },

    waitFor: async (params) => {
      try {
        const { selector, state, timeout } = WaitForParams.parse(params);
        await resolveLocator(selector).waitFor({ state, timeout });
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Wait failed",
        };
      }
    },

    goBack: async () => {
      try {
        await ctx.page.goBack();
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Go back failed",
        };
      }
    },

    getStorageState: async () => {
      try {
        const state = await ctx.context.storageState();
        return { ok: true, data: { state: JSON.stringify(state) } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Get storage state failed",
        };
      }
    },

    setStorageState: async ({ path }) => {
      try {
        await ctx.context.clearCookies();
        const raw = path.trim().startsWith("{")
          ? path
          : await import("fs/promises").then((fs) =>
              fs.readFile(path, "utf-8"),
            );
        const state = JSON.parse(raw) as {
          cookies?: Parameters<BrowserContext["addCookies"]>[0];
        };
        await ctx.context.addCookies(state.cookies ?? []);
        return { ok: true, data: { ok: true } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Set storage state failed",
        };
      }
    },
  };
}
