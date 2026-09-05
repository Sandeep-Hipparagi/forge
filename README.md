# FORGE

**Autonomous Test Orchestration Agent**

FORGE will accept a URL and optional login, explore the application, critique a
test plan, generate Playwright tests, classify failures, and heal only when its
evidence permits it.

FORGE is in its implementation bootstrap phase. The product specification lives in
[`docs/`](docs/README.md); the workspace currently provides only the deterministic
foundation needed to begin Ph1.

## MVP shape

The workspace preserves the intended boundaries: `apps/` hosts the future API,
dashboard, and controlled target; `packages/core` owns pure domain rules; and
the other package boundaries are reserved before implementation crosses them.
The full architecture, requirements, and delivery gates remain in [`docs/`](docs/README.md).

## Ph0 commands

Use Node `22.11.0` and pnpm `10.12.1` as pinned in [`.nvmrc`](.nvmrc) and
[`package.json`](package.json).

```bash
corepack enable
pnpm install
pnpm verify
```

`pnpm eval` runs `EC-00`, a browser- and model-free replay smoke check. Browser
automation, model adapters, persistence, the API, dashboard, and the Aperture target
are intentionally scheduled for subsequent phases.
