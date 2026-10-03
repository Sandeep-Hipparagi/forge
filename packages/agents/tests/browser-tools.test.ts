import { describe, expect, it, vi } from "vitest";
import { createBrowserTools } from "../src/browser-tools.js";

describe("browser tool contract", () => {
  it("returns ToolResult failures instead of throwing", async () => {
    const tools = createBrowserTools({
      page: {
        goto: vi.fn().mockRejectedValue(new Error("offline")),
        title: vi.fn(),
      },
      context: {},
      browser: {},
    } as unknown as Parameters<typeof createBrowserTools>[0]);

    const result = await tools.navigate({ url: "http://localhost" });
    expect(result).toEqual({ ok: false, error: "offline" });
  });

  it("scrubs storage-state writes to cookies without init-script side effects", async () => {
    const addCookies = vi.fn().mockResolvedValue(undefined);
    const clearCookies = vi.fn().mockResolvedValue(undefined);
    const tools = createBrowserTools({
      page: {},
      context: { addCookies, clearCookies },
      browser: {},
    } as unknown as Parameters<typeof createBrowserTools>[0]);

    const result = await tools.setStorageState({
      path: JSON.stringify({ cookies: [] }),
    });
    expect(result.ok).toBe(true);
    expect(clearCookies).toHaveBeenCalledOnce();
    expect(addCookies).toHaveBeenCalledOnce();
  });
});
