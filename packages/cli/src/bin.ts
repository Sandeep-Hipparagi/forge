import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runDoctor } from "./commands/doctor.js";
import { runEval } from "./commands/eval.js";

export const FORGE_CLI_VERSION = "0.0.0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function main(): number {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (command) {
    case "doctor":
      return runDoctor(repoRoot);

    case "eval":
      return runEval(repoRoot, {
        tier: flags.tier === "live" ? "live" : "replay",
        caseId: typeof flags.case === "string" ? flags.case : undefined,
        repeat: typeof flags.repeat === "string" ? Number(flags.repeat) : 1,
        coverage: Boolean(flags.coverage),
      });

    default:
      console.error(
        `forge: unknown or not-yet-implemented command '${command ?? ""}'. Available in Ph0: doctor, eval.`,
      );
      return 1;
  }
}

process.exit(main());
