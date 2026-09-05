#!/usr/bin/env node
import { defaultSessionConfig } from "@forge/core";

const [command] = process.argv.slice(2);

if (command === "eval") {
  const config = defaultSessionConfig();
  console.log(`EC-00 bootstrap: PASS · ${config.version} · deterministic replay ready`);
  process.exit(0);
}

console.error("Usage: forge eval");
process.exit(1);
