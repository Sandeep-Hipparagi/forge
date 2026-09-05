module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      severity: "error",
      comment: "core must stay I/O-free so every verdict is testable without a browser",
      from: { path: "^packages/core" },
      to: { path: "^(packages/|@forge/)(runner|store|agents|perception|orchestrator|cli)" },
    },

    {
      name: "no-node-builtins-in-core",
      severity: "error",
      comment: "core must not reach the filesystem, the network or a subprocess",
      from: { path: "^packages/core" },
      to: {
        dependencyTypes: ["core"],
        path: "^(node:)?(fs|path|child_process|http|https|net|crypto)$",
      },
    },

    {
      name: "agents-cannot-persist",
      severity: "error",
      comment: "a sub-agent that can write the event log can rewrite history — 06 §2.3",
      from: { path: "^packages/agents" },
      to: { path: "^(packages/|@forge/)(store|runner|orchestrator)" },
    },

    {
      name: "one-model-client",
      severity: "error",
      comment: "only the loop harness talks to the model — 06 §2",
      from: { pathNot: "^packages/agents/harness" },
      to: { dependencyTypes: ["npm"], path: "^@anthropic-ai/" },
    },

    {
      name: "web-talks-http-only",
      severity: "error",
      comment: "the dashboard renders; it never imports the orchestrator",
      from: { path: "^apps/web" },
      to: { path: "^(packages/|@forge/)(agents|orchestrator|runner|store|perception)" },
    },

    {
      name: "sut-is-isolated",
      severity: "error",
      comment: "the system under test must not know FORGE exists",
      from: { path: "^apps/sut" },
      // Both forms: a relative reach into packages/, and a bare `@forge/*`
      // specifier, which is unresolvable from apps/sut and would otherwise
      // produce a tsc error in the wrong place at the wrong time.
      to: { path: "^(packages/|@forge/)" },
    },

    {
      name: "no-unresolvable",
      severity: "error",
      from: { pathNot: "([.]test[.]ts|next-env[.]d[.]ts)$" },
      to: { couldNotResolve: true },
    },

    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],

  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".json"] },
    exclude: { path: "node_modules|dist|\\.next" },
  },
};
