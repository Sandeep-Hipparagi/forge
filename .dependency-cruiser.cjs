module.exports = {
  options: {
    doNotFollow: { path: "(^|/)node_modules/" },
    exclude: "(^|/)node_modules/",
    tsConfig: { fileName: "tsconfig.json" },
  },
  forbidden: [
    {
      name: "core-is-pure",
      severity: "error",
      from: { path: "^packages/core" },
      to: {
        path: "^(packages/|@forge/)(runner|store|agents|perception|orchestrator|cli)",
      },
    },
    {
      name: "agents-cannot-persist",
      severity: "error",
      from: { path: "^packages/agents" },
      to: { path: "^(packages/|@forge/)(store|runner|orchestrator)" },
    },
    {
      name: "one-model-client",
      severity: "error",
      from: { pathNot: "^packages/agents/harness" },
      to: { dependencyTypes: ["npm"], path: "^@anthropic-ai/" },
    },
    {
      name: "web-talks-http-only",
      severity: "error",
      from: { path: "^apps/web" },
      to: {
        path: "^(packages/|@forge/)(agents|orchestrator|runner|store|perception)",
      },
    },
    {
      name: "sut-is-isolated",
      severity: "error",
      from: { path: "^apps/sut" },
      to: { path: "^(packages/|@forge/)" },
    },
    {
      name: "no-unresolvable",
      severity: "error",
      from: { pathNot: "([.]test[.]ts|next-env[.]d[.]ts)$" },
      to: { couldNotResolve: true },
    },
    {
      name: "no-node-builtins-in-core",
      severity: "error",
      from: { path: "^packages/core" },
      to: {
        dependencyTypes: ["core"],
        path: "^(node:)?(fs|path|child_process|http|https|net|crypto)$",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
};
