import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const expectedNode = readFileSync(".nvmrc", "utf8").trim();
const expectedPnpm = "10.12.1";
const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
const errors = [];

if (process.version.slice(1) !== expectedNode) errors.push(`expected Node ${expectedNode}; found ${process.version}`);
if (pnpm.status !== 0 || pnpm.stdout.trim() !== expectedPnpm) errors.push(`expected pnpm ${expectedPnpm}`);
if (process.env.FORGE_DISPOSABLE_TARGET === "true" && process.env.FORGE_ALLOWED_HOSTS?.split(",").some((host) => !["localhost", "127.0.0.1"].includes(host))) {
  errors.push("disposable targets require loopback-only allowed hosts");
}
if (errors.length > 0) {
  console.error(`forge doctor: FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`forge doctor: PASS · Node ${process.version}`);
