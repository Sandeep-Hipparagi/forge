import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const expectedNode = readFileSync(".nvmrc", "utf8").trim();
const isWin = process.platform === "win32";
const pnpm = spawnSync("pnpm --version", { encoding: "utf8", shell: true });
const playwright = spawnSync("pnpm exec playwright --version", {
  encoding: "utf8",
  shell: true,
});
const errors = [];

const nodeVersion = process.version.slice(1);
const [nodeMajor, nodeMinor] = nodeVersion.split(".").map(Number);
const [expMajor, expMinor] = expectedNode.split(".").map(Number);
if ((nodeMajor ?? 0) < (expMajor ?? 0) || (nodeMajor === expMajor && (nodeMinor ?? 0) < (expMinor ?? 0))) {
  errors.push(`expected Node >= ${expectedNode}; found ${process.version}`);
}

const pnpmVersion = pnpm.stdout?.trim() ?? "";
const [pnpmMajor] = pnpmVersion.split(".").map(Number);
if (pnpm.status !== 0 || !pnpmMajor || pnpmMajor < 9) {
  errors.push(`expected pnpm >= 9.0.0; found ${pnpmVersion || "unknown"}`);
}

if (playwright.status !== 0) {
  errors.push(
    "Chromium/Playwright is unavailable; run pnpm exec playwright install chromium",
  );
}
const bind = process.env.FORGE_API_BIND ?? "127.0.0.1";
const apiPort = Number(process.env.FORGE_API_PORT ?? "4000");
const allowedHosts = (
  process.env.FORGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1"
).split(",");
const writeAllowlist =
  process.env.FORGE_WRITE_ALLOWLIST ?? "artifacts,apps/sut/tests";
const secretProvider = process.env.FORGE_SECRET_PROVIDER ?? "env";
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65_535)
  errors.push("FORGE_API_PORT must be an integer between 1 and 65535");
if (secretProvider !== "env")
  errors.push("FORGE_SECRET_PROVIDER must be the supported 'env' adapter");
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
  errors.push(
    "live model mode cannot check reachability without ANTHROPIC_API_KEY",
  );
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
