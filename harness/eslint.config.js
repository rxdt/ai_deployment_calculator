import js from "@eslint/js"; // ESLint recommended rules
import json from "@eslint/json"; // JSON/JSONC/JSON5 language plugin
import globals from "globals"; // Browser/node globals
import security from "eslint-plugin-security"; // Basic security checks
import tseslint from "typescript-eslint"; // TypeScript ESLint flat-config package
import unicorn from "eslint-plugin-unicorn"; // Opinionated modern-JS best practices
import sonarjs from "eslint-plugin-sonarjs"; // Bug/code-smell detection
import importX from "eslint-plugin-import-x"; // Import resolution and ordering
import jsdoc from "eslint-plugin-jsdoc"; // JSDoc correctness
import promise from "eslint-plugin-promise"; // Promise best practices
import regexp from "eslint-plugin-regexp"; // Safe, readable regex
import n from "eslint-plugin-n"; // Node.js correctness
import noOnlyTests from "eslint-plugin-no-only-tests"; // Block focused tests
import eslintConfigPrettier from "eslint-config-prettier"; // Disable formatting rules (Prettier owns formatting)
import { defineConfig, globalIgnores } from "eslint/config"; // ESLint flat-config helpers.
import { fileURLToPath } from "node:url";

const securityErrors = Object.fromEntries(
  Object.keys(security.rules).map((ruleName) => [
    `security/${ruleName}`,
    "error",
  ]),
);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const typeScriptFiles = ["**/*.ts"];
const testTypeScriptFiles = ["**/*.test.ts", "**/*.spec.ts"];
const configTypeScriptFiles = ["**/*.config.ts", "**/vite.config.ts"];

export default defineConfig([
  globalIgnores([
    "**/coverage/",
    "**/dist/",
    "**/build/",
    "**/node_modules/",
    "**/test-results/",
    "**/.lighthouseci/",
    ".git/",
    ".codex/",
    ".agents/",
    "scratchpad/",
    "**/package-lock.json",
  ]),
  // Production TypeScript files. Test-specific relaxations live in the next block.
  {
    files: typeScriptFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.all, // Every TypeScript-ESLint rule; explicit overrides below keep the local policy readable
      unicorn.configs["flat/all"],
      sonarjs.configs.recommended,
      security.configs.recommended,
      importX.configs["flat/recommended"],
      jsdoc.configs["flat/recommended-typescript-error"],
      promise.configs["flat/recommended"],
      regexp.configs["flat/recommended"],
      n.configs["flat/recommended-module"],
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ["harness/tsconfig.app.json", "harness/tsconfig.json"],
        tsconfigRootDir: repoRoot,
      },
    },
    settings: {
      // Resolve TS/JS imports (extensionless and .ts) via the node resolver.
      "import-x/resolver": {
        node: { extensions: [".ts", ".js", ".json"] },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error", // Clean up lazy comments
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*.test", "*.test.*", "*.spec", "*.spec.*"],
              message: "Production source cannot import test modules.",
            },
          ],
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: ["variable", "function", "objectLiteralProperty"],
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
        },
        {
          selector: ["typeLike", "class"],
          format: ["PascalCase"],
        },
        {
          selector: "objectLiteralProperty",
          modifiers: ["requiresQuotes"],
          format: null,
        },
      ],
      // Owner decision: no-magic-numbers is impractical for this codebase (it fires 220+
      // times in src/ on ordinary numeric/index math). Disabled for TypeScript; revisit later.
      "@typescript-eslint/no-magic-numbers": "off",
      // TYPE SAFETY Stop lazily skipping types
      "@typescript-eslint/no-explicit-any": "error", // Outlaws 'any' completely
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-extraneous-class": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // SECURITY & ROBUSTNESS (Blocks data leaks and bad patterns)
      ...securityErrors,
      "no-console": ["error", { allow: ["warn", "error"] }], // Real loggers, no console.log
      "no-restricted-globals": ["error", "event"],
      eqeqeq: ["error", "always"],
      "no-alert": "error",
      "no-caller": "error",
      "no-constructor-return": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-implicit-coercion": "error",
      "no-implied-eval": "error",
      "no-lone-blocks": "error",
      "no-new-func": "error",
      "no-param-reassign": "error",
      "no-promise-executor-return": "error",
      "no-return-await": "error",
      "no-script-url": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",
      "no-useless-assignment": "error",
      "prefer-const": "error",
      "prefer-object-spread": "error",
      "require-atomic-updates": "error",

      // NO SPAGHETTI
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-lines": [
        "error",
        { max: 500, skipBlankLines: true, skipComments: true }, // Default is 300
      ],
      "max-depth": ["error", 3],
      "max-params": ["error", 4], // Caps function parameters
      "@typescript-eslint/max-params": ["error", { max: 4 }], // TS variant defaults to 3; align with base

      complexity: ["error", 10], // Low carb
      "sonarjs/cognitive-complexity": ["error", 10],
      "max-statements": ["error", { max: 25 }],
      "no-inner-declarations": "error", // Prevent fracturing code into tiny pieces
      "no-restricted-syntax": [
        "error",
        {
          selector: "ForInStatement",
          message:
            "Avoid for-in over prototype chains; use Object.keys/Object.entries on owned data.",
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message:
            "Do not assign innerHTML. Use safe rendering or sanitized HTML.",
        },
        {
          selector: "TSEnumDeclaration",
          message:
            "Prefer literal objects plus union types; enums add runtime code and awkward interop.",
        },
        {
          selector: "TSModuleDeclaration",
          message:
            "Avoid namespaces/modules; use normal ES module imports and exports.",
        },
        {
          selector: "SequenceExpression",
          message:
            "Sequence expressions hide side effects; split the statements.",
        },
        {
          selector: "LabeledStatement",
          message:
            "Labels make control flow hard to scan; extract a small function instead.",
        },
        {
          selector: "WithStatement",
          message: "with changes scope lookup and is never acceptable here.",
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: "Never evaluate strings as code.",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "Never construct functions from strings.",
        },
      ],

      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      // TypeScript typecheck owns missing-import resolution across TS/ESM layouts.
      "import-x/no-unresolved": "off",
      "n/no-missing-import": "off",

      "@typescript-eslint/prefer-readonly-parameter-types": "off",

      "unicorn/no-unsafe-dom-html": "error",
      "unicorn/no-null": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/no-unreadable-new-expression": "off",
      "unicorn/prefer-dom-node-html-methods": "off",
      "unicorn/prefer-iterator-concat": "off",
      "unicorn/require-array-sort-compare": "off",
      "unicorn/consistent-class-member-order": "off",

      // Turn ON rules that actually prevent broken code documentation
      "jsdoc/check-param-names": "error", // Comment names match actual code variables
      "jsdoc/check-tag-names": "error", // No typos in tags like writing @paramm
      // NOISY
      "jsdoc/require-returns": "off",
      "jsdoc/require-param-description": "off",
      "jsdoc/check-alignment": "off",
    },
  },
  // TypeScript test files.
  {
    files: testTypeScriptFiles,
    plugins: { "no-only-tests": noOnlyTests },
    rules: {
      "@typescript-eslint/max-params": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/strict-void-return": "off",
      "import-x/no-named-as-default": "off",
      "max-lines": "off",
      // describe/it callbacks group many cases; line caps target production spaghetti, not test suites.
      "max-lines-per-function": "off",
      "no-only-tests/no-only-tests": "error",
      "sonarjs/no-alphabetical-sort": "off",
      "sonarjs/no-floating-point-equality": "off",
      "sonarjs/prefer-specific-assertions": "off",

      "unicorn/max-nested-calls": "off",
      "unicorn/no-unsafe-dom-html": "off",
      "unicorn/prefer-dom-node-html-methods": "off",
    },
  },
  // Harness TypeScript files: Node tooling must read git-provided paths and spawn portable tools by name.
  {
    files: ["harness/**/*.ts"],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  // TypeScript config files.
  {
    files: configTypeScriptFiles,
    rules: {
      "no-console": "off",
    },
  },
  // JSON family files, linted via `npm run json:lint`.
  {
    files: ["**/*.json"],
    ignores: ["tsconfig*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.jsonc", "tsconfig*.json"],
    plugins: { json },
    language: "json/jsonc",
    extends: ["json/recommended"],
  },
  {
    files: ["**/*.json5"],
    plugins: { json },
    language: "json/json5",
    extends: ["json/recommended"],
  },
  // Final global overrides.
  // Formatting compatibility. Keep last so Prettier wins over stylistic rules.
  eslintConfigPrettier,
]);
