import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runReset } from "./reset.js";

describe("forge reset", () => {
  it("clears artifacts and restores deterministic fixtures well under the budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "forge-reset-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "stale.txt"), "stale");
    await mkdir(join(root, "tests", "generated"), { recursive: true });
    await writeFile(join(root, "tests", "generated", "healed.spec.ts"), "healed");
    await mkdir(join(root, "fixtures", "plans"), { recursive: true });
    await writeFile(join(root, "fixtures", "plans", "baseline.spec.ts"), "baseline");
    await mkdir(join(root, "fixtures", "sut"), { recursive: true });
    await writeFile(join(root, "fixtures", "sut", "seed.json"), '{"nextId":1000}');

    const startedAt = performance.now();
    expect(await runReset(root)).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(20_000);
    await expect(stat(join(root, "artifacts", "stale.txt"))).rejects.toThrow();
    await expect(stat(join(root, "tests", "generated", "healed.spec.ts"))).rejects.toThrow();
    expect(await readFile(join(root, "tests", "generated", "baseline.spec.ts"), "utf8")).toBe(
      "baseline",
    );
    expect(await readFile(join(root, "apps", "sut", "state", "seed.json"), "utf8")).toBe(
      '{"nextId":1000}',
    );
  });
});
