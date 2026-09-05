import type { Capability, Lap } from "@forge/core";
import { tg3OrderBacklog, tg4DependenciesBanked } from "./guards.js";

export function nextCapability(
  capabilities: readonly Capability[],
  laps: readonly Lap[],
): Capability | null {
  const banked = new Set(
    laps.filter(({ status }) => status === "BANKED").map(({ capabilityId }) => capabilityId),
  );
  const started = new Set(laps.map(({ capabilityId }) => capabilityId));
  return (
    tg3OrderBacklog(capabilities).find(
      (capability) => !started.has(capability.id) && tg4DependenciesBanked(capability, banked),
    ) ?? null
  );
}

export type LapExecutor = (capability: Capability, index: number) => Promise<Lap>;
export type LapFailureBanker = (
  capability: Capability,
  index: number,
  error: unknown,
) => Promise<Lap>;

/** Execute eligible capabilities serially; every failure is banked before scheduling continues. */
export async function runLapSchedule(
  capabilities: readonly Capability[],
  existingLaps: readonly Lap[],
  execute: LapExecutor,
  bankFailure: LapFailureBanker,
): Promise<Lap[]> {
  const laps = [...existingLaps];
  for (;;) {
    const capability = nextCapability(capabilities, laps);
    if (capability === null) return laps;
    const index = laps.length;
    try {
      const lap = await execute(capability, index);
      if (lap.status !== "BANKED" || lap.outcome === null) {
        throw new Error(`Lap executor returned an incomplete lap: ${lap.id}`);
      }
      laps.push(lap);
    } catch (error) {
      const failed = await bankFailure(capability, index, error);
      if (failed.status !== "BANKED" || failed.outcome !== "LAP_FAILED") {
        throw new Error(`Failure banker did not persist LAP_FAILED: ${failed.id}`);
      }
      laps.push(failed);
    }
  }
}
