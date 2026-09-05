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
);
