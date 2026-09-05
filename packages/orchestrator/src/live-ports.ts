import type { Affordance, Clock, IdGen, State } from "@forge/core";
import type { ExplorerDriverPorts, FrontierObservation } from "@forge/agent-explorer";
import { affordancesOf, stateSignature } from "@forge/perception";
import type { ForgeStore } from "@forge/store";
import {
  closeExplorationBrowser,
  openExplorationBrowser,
  captureSnapshot,
  type ExplorationBrowser,
} from "@forge/runner";

export type ExploreEvidenceSink = {
  store: ForgeStore;
  sessionId: string;
};

async function capturePageShot(
  page: ExplorationBrowser["page"],
  evidence: ExploreEvidenceSink,
  meta: { label: string; phase: string; action?: string },
): Promise<string> {
  const png = await page.screenshot({ type: "png", fullPage: false });
  const url = page.url();
  const title = await page.title().catch(() => "");
  const shot = evidence.store.putEvidence({
    sessionId: evidence.sessionId,
    lapId: null,
    runId: null,
    stepId: null,
    type: "SCREENSHOT",
    label: meta.label || title || url,
    content: png,
    metadata: {
      url,
      title,
      phase: meta.phase,
      ...(meta.action !== undefined ? { action: meta.action } : {}),
    },
  });
  evidence.store.appendEvent({
    sessionId: evidence.sessionId,
    lapId: null,
    actor: "explorer",
    type: "evidence.captured",
    payload: {
      evidenceId: shot.id,
      kind: "SCREENSHOT",
      url,
      title,
      phase: meta.phase,
      action: meta.action ?? null,
      label: shot.label,
    },
  });
  return shot.id;
}

/**
 * Build frontier driver ports over a live Playwright page.
 * Perception stays pure; I/O stays in the runner; this seam only wires them.
 */
export function createLiveExplorePorts(options: {
  page: ExplorationBrowser["page"];
  clock: Clock;
  ids: IdGen;
  entryUrl: string;
  /** When set, each observe/exercise captures a PNG and emits evidence.captured. */
  evidence?: ExploreEvidenceSink;
}): ExplorerDriverPorts {
  const { page, clock, ids, entryUrl, evidence } = options;
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
    let snapshotEvidenceId = ids.next("ev");

    if (evidence !== undefined) {
      snapshotEvidenceId = await capturePageShot(page, evidence, {
        label: snapshot.title || snapshot.url,
        phase: "explore.observe",
      });
    }

    return {
      url: snapshot.url,
      title: snapshot.title ?? "",
      signature: stateSignature(snapshot),
      snapshotEvidenceId,
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
        if (evidence !== undefined) {
          await capturePageShot(page, evidence, {
            label: `restore · ${state.title || state.url}`,
            phase: "explore.restore",
            action: "restore",
          });
        }
        const captured = await captureSnapshot(page);
        if (!captured.ok) return { matched: false };
        return { matched: stateSignature(captured.data.snapshot) === state.signature };
      } catch {
        return { matched: false };
      }
    },
    exercise: async (_item, affordance: Affordance) => {
      const started = performance.now();
      const name = affordance.accessibleName || affordance.ref;
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
          const evidenceIds: string[] = [];
          if (evidence !== undefined) {
            evidenceIds.push(
              await capturePageShot(page, evidence, {
                label: `fill · ${name}`,
                phase: "explore.action",
                action: "fill",
              }),
            );
          }
          return {
            ok: true as const,
            data: { action: "fill" as const },
            evidenceIds,
            durationMs: performance.now() - started,
          };
        }
        await locator.click();
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        // Let SPA navigations settle briefly so the next frame is meaningful.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const evidenceIds: string[] = [];
        if (evidence !== undefined) {
          evidenceIds.push(
            await capturePageShot(page, evidence, {
              label: `click · ${name}`,
              phase: "explore.action",
              action: "click",
            }),
          );
        }
        return {
          ok: true as const,
          data: { action: "click" as const },
          evidenceIds,
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
  evidence?: ExploreEvidenceSink;
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
    ...(options.evidence !== undefined ? { evidence: options.evidence } : {}),
  });
  return {
    ok: true,
    ports,
    close: async () => {
      await closeExplorationBrowser(opened.data);
    },
  };
}
