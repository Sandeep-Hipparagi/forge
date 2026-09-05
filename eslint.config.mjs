import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "artifacts/**", "docs/**"],
    languageOptions: {
      globals: { console: "readonly", module: "readonly", process: "readonly" },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message: "Take Clock from RunContext — docs/04-build/15 §4.4.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Take Rng from RunContext — docs/04-build/15 §4.4.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:crypto", "crypto"],
              message: "Take IdGen from RunContext — docs/04-build/15 §4.4.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/{agents,runner}/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement",
          message: "Return a typed ToolResult; tool paths do not throw.",
        },
      ],
    },
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "node:fs",
            "node:path",
            "node:crypto",
            "node:child_process",
          ],
        },
      ],
      "no-restricted-globals": ["error", "Date", "Math"],
    },
  },
  {
    files: ["packages/core/src/env.ts"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
      "no-restricted-imports": "off",
    },
  },
);
