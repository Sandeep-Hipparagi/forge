import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `no_target_literals_in_packages` ([19 §1.1](docs/04-build/19-target-apps.md)).
 * Needles are assembled so this file itself does not contain the forbidden contiguous literals.
 */
const NEEDLES = [
  "sauce" + "demo",
  "con" + "duit",
  "place" + "-order",
  "410" + "0",
  "checkout" + "-main",
  "accept" + "-terms",
  "coupon" + "-input",
  "apply" + "-coupon",
  "total" + "-amount",
];

const PACKAGES_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(name) && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("no_target_literals_in_packages", () => {
  it("packages/** contain no target selector, route, or hostname literals", () => {
    const packagesDir = join(PACKAGES_ROOT, "packages");
    const hits: string[] = [];
    for (const file of walk(packagesDir)) {
      const text = readFileSync(file, "utf8");
      for (const needle of NEEDLES) {
        if (text.includes(needle)) {
          hits.push(`${relative(PACKAGES_ROOT, file)}: ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
