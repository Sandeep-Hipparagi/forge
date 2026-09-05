module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      severity: "error",
      from: { path: "^packages/core" },
      to: { path: "^(packages/|@forge/)(runner|store|agents|perception|orchestrator|cli)" },
    },
    {
      name: "no-node-builtins-in-core",
      severity: "error",
      from: { path: "^packages/core" },
      to: { dependencyTypes: ["core"], path: "^(node:)?(fs|path|child_process|http|https|net|crypto)$" },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
};
