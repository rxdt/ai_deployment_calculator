import js from "@eslint/js"; // ESLint recommended rules
import globals from "globals"; // Browser/node globals
import security from "eslint-plugin-security"; // Basic security checks
import tseslint from "typescript-eslint"; // TypeScript ESLint flat-config package
import { defineConfig, globalIgnores } from "eslint/config"; // ESLint flat-config helpers.

export default defineConfig([
  globalIgnores(["coverage/", "dist/", "build/", "node_modules/"]),
  {
    files: ["**/*.ts"], // Rules on all TS files (no JSX in this project)
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked, // Use type-checked base rules
      ...tseslint.configs.stylisticTypeChecked,
    ],
    plugins: {
      "security": security,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Auto-resolves the right tsconfig per file (incl. tests/configs)
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error", // Clean up lazy comments
    },
    rules: {
      // TYPE SAFETY Stop lazily skipping types
      "@typescript-eslint/no-explicit-any": "error", // Outlaws 'any' completely
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // SECURITY & ROBUSTNESS (Blocks data leaks and bad patterns)
      "security/detect-object-injection": "warn", // Catch client-side injection vulnerabilities
      "no-console": ["warn", { allow: ["warn", "error"] }], // Real loggers, no console.log

      // NO SPAGHETTI
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 3],
      "max-params": ["error", 4], // Caps function parameters
      "complexity": ["error", 10], // Low carb
      "no-inner-declarations": "error", // Prevent fracturing code into tiny pieces

      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "max-lines": "off",
    },
  },
  // SEPARATION FOR ROOT CONFIGURATIONS
  {
    files: ["**/*.config.ts", "**/vite.config.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);
