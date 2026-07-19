import eslint from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/out/**",
      "**/worker-configuration.d.ts",
      "**/worker-dist/**",
    ],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...nextVitals, ...nextTypescript],
    settings: {
      next: {
        rootDir: "apps/web/",
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        process: "readonly",
      },
    },
  },
);
