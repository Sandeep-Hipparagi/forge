import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadDotenv } from "../util/dotenv.js";

type Check = { name: string; ok: boolean; detail: string };

function readPin(repoRoot: string): { node: string; pnpm: string } {
  const nvmrc = readFileSync(join(repoRoot, ".nvmrc"), "utf8").trim();
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const pnpm = (pkg.packageManager ?? "").replace(/^pnpm@/, "");
  return { node: nvmrc, pnpm };
}

function checkToolchain(repoRoot: string): Check[] {
  const pin = readPin(repoRoot);
  const nodeActual = process.version.replace(/^v/, "");
  const nodeOk = nodeActual === pin.node;

  let pnpmActual = "";
  try {
    pnpmActual = execFileSync("pnpm", ["-v"], { encoding: "utf8", shell: true }).trim();
  } catch {
    pnpmActual = "";
  }
  const pnpmOk = pnpmActual === pin.pnpm;

  return [
    { name: "node-version", ok: nodeOk, detail: `expected ${pin.node}, found ${nodeActual}` },
    {
      name: "pnpm-version",
      ok: pnpmOk,
      detail: `expected ${pin.pnpm}, found ${pnpmActual || "unresolved"}`,
    },
  ];
}

function checkChromium(): Check {
  const cacheRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
      : join(process.env.HOME ?? "", ".cache", "ms-playwright"));

  if (!existsSync(cacheRoot)) {
    return {
      name: "chromium-installed",
      ok: false,
      detail: `browser cache not found at ${cacheRoot}`,
    };
  }
  const hasChromium = readdirSync(cacheRoot).some(
    (entry: string) =>
      entry.startsWith("chromium-") || entry.startsWith("chromium_headless_shell-"),
  );
  return {
    name: "chromium-installed",
    ok: hasChromium,
    detail: hasChromium ? `found under ${cacheRoot}` : `no chromium-* revision under ${cacheRoot}`,
  };
}

function checkSafetyEnv(env: Record<string, string>): Check[] {
  const writeAllowlist = env.FORGE_WRITE_ALLOWLIST ?? "artifacts,apps/sut/tests";
  const allowedHosts = (env.FORGE_ALLOWED_HOSTS ?? "localhost,127.0.0.1")
    .split(",")
    .map((h) => h.trim());
  const disposableTarget = (env.FORGE_DISPOSABLE_TARGET ?? "false") === "true";
  const sutControlEnabled = (env.SUT_CONTROL_ENABLED ?? "true") === "true";
  const apiBind = env.FORGE_API_BIND ?? "127.0.0.1";

  const loopbackHosts = new Set(["localhost", "127.0.0.1"]);
  const allowlistOk = writeAllowlist === "artifacts,apps/sut/tests";
  const hostsOk = !(disposableTarget && allowedHosts.some((h) => !loopbackHosts.has(h)));
  const bindOk = !(sutControlEnabled && !loopbackHosts.has(apiBind));

  return [
    {
      name: "write-allowlist-not-widened",
      ok: allowlistOk,
      detail: `FORGE_WRITE_ALLOWLIST=${writeAllowlist}`,
    },
    {
      name: "disposable-target-implies-loopback-hosts",
      ok: hostsOk,
      detail: `FORGE_DISPOSABLE_TARGET=${disposableTarget}, FORGE_ALLOWED_HOSTS=${allowedHosts.join(",")}`,
    },
    {
      name: "sut-control-implies-loopback-bind",
      ok: bindOk,
      detail: `SUT_CONTROL_ENABLED=${sutControlEnabled}, FORGE_API_BIND=${apiBind}`,
    },
  ];
}

function checkModelReachability(env: Record<string, string>, envFileExists: boolean): Check {
  if (!envFileExists) {
    return {
      name: "model-reachability",
      ok: true,
      detail: "no .env yet (copy .env.example to opt into live mode) — 15 §7",
    };
  }
  const enabled = (env.FORGE_LLM_ENABLED ?? "true") === "true";
  if (!enabled)
    return {
      name: "model-reachability",
      ok: true,
      detail: "FORGE_LLM_ENABLED=false — deterministic mode, key not required",
    };
  const hasKey = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 0);
  return {
    name: "model-reachability",
    ok: hasKey,
    detail: hasKey
      ? "ANTHROPIC_API_KEY set"
      : "ANTHROPIC_API_KEY missing while FORGE_LLM_ENABLED=true",
  };
}

export function runDoctor(repoRoot: string): number {
  const envPath = join(repoRoot, ".env");
  const envFileExists = existsSync(envPath);
  const env = { ...loadDotenv(envPath), ...process.env } as Record<string, string>;

  const checks: Check[] = [
    ...checkToolchain(repoRoot),
    checkChromium(),
    checkModelReachability(env, envFileExists),
    ...checkSafetyEnv(env),
  ];

  const width = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    const badge = c.ok ? "OK  " : "FAIL";
    console.log(`[${badge}] ${c.name.padEnd(width)}  ${c.detail}`);
  }

  const allOk = checks.every((c) => c.ok);
  console.log(allOk ? "\nforge doctor: all checks green" : "\nforge doctor: drift detected");
  return allOk ? 0 : 1;
}
