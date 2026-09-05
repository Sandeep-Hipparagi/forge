// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

const determinismRestrictions = {
  "no-restricted-globals": [
    "error",
    { name: "Date", message: "Take Clock from RunContext — 15 §4.4" },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Take Rng from RunContext — 15 §4.4" },
    { object: "crypto", property: "randomUUID", message: "Take IdGen from RunContext — 15 §4.4" },
  ],
};

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/artifacts/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // Determinism has three chokepoints, and no fourth — 15 §4.4
    rules: determinismRestrictions,
  },
  {
    files: ["packages/core/src/env.ts"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },
  {
    // The no-throw law — 15 §4.1
    files: [
      "packages/runner/**/*.ts",
      "packages/perception/**/*.ts",
      "packages/agents/*/tools/**/*.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message:
            "Tools return ToolResult, never throw. See docs/02-architecture/06-agent-contracts.md §1",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
