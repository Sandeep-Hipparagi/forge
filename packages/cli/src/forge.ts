#!/usr/bin/env node
import { defaultSessionConfig } from "@forge/core";
import { runReplayCase } from "@forge/evals/src/replay.js";
import { readFileSync } from "node:fs";

const [command] = process.argv.slice(2);

if (command === "eval") {
  const fixture = JSON.parse(
    readFileSync("fixtures/golden/EC-00-bootstrap.json", "utf8"),
  );
  const config = defaultSessionConfig();
  if (
    fixture.expected !== "PASS" ||
    fixture.requiresBrowser ||
    fixture.requiresModel
  )
    process.exit(1);
  const replay = await runReplayCase();
  if (replay.status !== "COMPLETED" || replay.eventSeq.length !== 0)
    process.exit(1);
  console.log(`EC-00 fixture replay: PASS · ${config.version}`);
  process.exit(0);
}

console.error("Usage: forge eval");
process.exit(1);
