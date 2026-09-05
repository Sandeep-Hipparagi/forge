import type { Affordance, Clock, IdGen, State } from "@forge/core";
import type { ExplorerDriverPorts, FrontierObservation } from "@forge/agent-explorer";
import { affordancesOf, stateSignature } from "@forge/perception";
import {
  closeExplorationBrowser,
  openExplorationBrowser,
  captureSnapshot,
  type ExplorationBrowser,
} from "@forge/runner";

/**
 * Build frontier driver ports over a live Playwright page.
 * Perception stays pure; I/O stays in the runner; this seam only wires them.
 */
export function createLiveExplorePorts(options: {
  page: ExplorationBrowser["page"];
  clock: Clock;
  ids: IdGen;
  entryUrl: string;
}): ExplorerDriverPorts {
  const { page, clock, ids, entryUrl } = options;
  let navigated = false;

  const observe = async (): Promise<FrontierObservation> => {
    if (!navigated) {
      await page.goto(entryUrl, { waitUntil: "domcontentloaded" });
      navigated = true;
    }
    const captured = await captureSnapshot(page);
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }
    const { snapshot } = captured.data;
    return {
      url: snapshot.url,
      title: snapshot.title ?? "",
      signature: stateSignature(snapshot),
      snapshotEvidenceId: ids.next("ev"),
      affordances: affordancesOf(snapshot),
    };
  };

  return {
    clock,
    ids,
    observe,
    restore: async (state: State) => {
      try {
        await page.goto(state.url, { waitUntil: "domcontentloaded" });
        const captured = await captureSnapshot(page);
        if (!captured.ok) return { matched: false };
        return { matched: stateSignature(captured.data.snapshot) === state.signature };
      } catch {
        return { matched: false };
      }
    },
    exercise: async (_item, affordance: Affordance) => {
      const started = performance.now();
      try {
        const locator = page.locator(`aria-ref=${affordance.ref}`);
        const count = await locator.count();
        if (count === 0) {
          return {
            ok: false as const,
            error: { code: "LOCATOR_NOT_FOUND" as const, message: "resolved to 0 elements" },
            evidenceIds: [],
            durationMs: performance.now() - started,
          };
        }
        if (count > 1) {
          return {
            ok: false as const,
            error: { code: "LOCATOR_AMBIGUOUS" as const, message: "resolved to 2+ elements" },
            evidenceIds: [],
            durationMs: performance.now() - started,
          };
        }
        if (affordance.kind === "textbox") {
          await locator.fill("forge");
          return {
            ok: true as const,
            data: { action: "fill" as const },
            evidenceIds: [],
            durationMs: performance.now() - started,
          };
        }
        await locator.click();
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        return {
          ok: true as const,
          data: { action: "click" as const },
          evidenceIds: [],
          durationMs: performance.now() - started,
        };
      } catch (error) {
        return {
          ok: false as const,
          error: {
            code: "ELEMENT_NOT_INTERACTABLE" as const,
            message: error instanceof Error ? error.message : "click failed",
          },
          evidenceIds: [],
          durationMs: performance.now() - started,
        };
      }
    },
    delay: async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

export async function openLiveExploreDriver(options: {
  clock: Clock;
  ids: IdGen;
  entryUrl: string;
  storageStatePath?: string | null;
  headless?: boolean;
}): Promise<
  | { ok: true; ports: ExplorerDriverPorts; close: () => Promise<void> }
  | { ok: false; error: string }
> {
  const opened = await openExplorationBrowser({
    ...(options.storageStatePath !== undefined
      ? { storageStatePath: options.storageStatePath }
      : {}),
    headless: options.headless ?? true,
  });
  if (!opened.ok) {
    return { ok: false, error: opened.error.message };
  }
  const ports = createLiveExplorePorts({
    page: opened.data.page,
    clock: options.clock,
    ids: options.ids,
    entryUrl: options.entryUrl,
  });
  return {
    ok: true,
    ports,
    close: async () => {
      await closeExplorationBrowser(opened.data);
    },
  };
}
