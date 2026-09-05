import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { systemRunContext } from "@forge/core";
import { ForgeStore } from "@forge/store";
import { buildForgeServer, listenForgeServer } from "./server.js";

export * from "./server.js";

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const databasePath = resolve(repositoryRoot, process.env.FORGE_DB_PATH ?? "artifacts/forge.db");
  mkdirSync(dirname(databasePath), { recursive: true });
  const context = systemRunContext();
  const store = new ForgeStore({ databasePath, repositoryRoot, context });
  const app = buildForgeServer({
    store,
    context,
    allowedHosts: (process.env.FORGE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    webOrigin: `http://localhost:${process.env.FORGE_WEB_PORT ?? "3000"}`,
    repositoryRoot,
    liveSessions: (process.env.FORGE_LIVE_SESSIONS ?? "false").toLowerCase() === "true",
  });
  const port = Number.parseInt(process.env.FORGE_API_PORT ?? "4000", 10);
  const host = process.env.FORGE_API_BIND ?? "127.0.0.1";
  await listenForgeServer(app, port, host);
}
