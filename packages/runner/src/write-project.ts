import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EmittedProject } from "@forge/core";

/** Write an emitted portable project under `outDir` (caller owns allowlisting). */
export function writeEmittedProject(project: EmittedProject, outDir: string): string[] {
  const written: string[] = [];
  for (const file of project.files) {
    const target = join(outDir, file.relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
    written.push(file.relativePath);
  }
  return written;
}
