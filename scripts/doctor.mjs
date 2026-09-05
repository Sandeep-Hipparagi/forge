import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const expectedNode = readFileSync(".nvmrc", "utf8").trim();
const expectedPnpm = "10.12.1";
const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
const playwright = spawnSync("pnpm", ["exec", "playwright", "--version"], {
  encoding: "utf8",
});
const errors = [];

if (process.version.slice(1) !== expectedNode)
  errors.push(`expected Node ${expectedNode}; found ${process.version}`);
if (pnpm.status !== 0 || pnpm.stdout.trim() !== expectedPnpm)
  errors.push(`expected pnpm ${expectedPnpm}`);
if (playwright.status !== 0)
  errors.push(
    "Chromium/Playwright is unavailable; run pnpm exec playwright install chromium",
  );
const bind = process.env.FORGE_API_BIND ?? "127.0.0.1";
const allowedHosts = (
  process.env.FORGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1"
).split(",");
const writeAllowlist =
  process.env.FORGE_WRITE_ALLOWLIST ?? "artifacts,apps/sut/tests";
if (writeAllowlist !== "artifacts,apps/sut/tests")
  errors.push("write allowlist differs from the Ph0 safety contract");
if (
  process.env.SUT_CONTROL_ENABLED === "true" &&
  !["127.0.0.1", "localhost"].includes(bind)
)
  errors.push("SUT control requires loopback API binding");
if (
  (process.env.FORGE_LLM_ENABLED ?? "false") !== "false" &&
  !process.env.ANTHROPIC_API_KEY
)
  errors.push("live model mode requires ANTHROPIC_API_KEY");
if (
  process.env.FORGE_DISPOSABLE_TARGET === "true" &&
  allowedHosts.some((host) => !["localhost", "127.0.0.1"].includes(host))
) {
  errors.push("disposable targets require loopback-only allowed hosts");
}
if (errors.length > 0) {
  console.error(`forge doctor: FAIL\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`forge doctor: PASS · Node ${process.version}`);
