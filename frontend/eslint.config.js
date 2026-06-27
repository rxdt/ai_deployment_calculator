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

const securityErrors = Object.fromEntries(
  Object.keys(security.rules).map((ruleName) => [
    `security/${ruleName}`,
    "error",
  ]),
);

export default defineConfig([
  globalIgnores([
    "coverage/",
    "dist/",
    "build/",
    "node_modules/",
    "test-results/",
    "package-lock.json",
  ]),
  {
    files: ["**/*.ts"], // Rules on all TS files (no JSX in this project)
    extends: [
      js.configs.recommended,
      ...tseslint.configs.all, // Every TypeScript-ESLint rule; explicit overrides below keep the local policy readable
      unicorn.configs["flat/all"],
      sonarjs.configs.recommended,
      security.configs.recommended,
      importX.configs["flat/recommended"],
      jsdoc.configs["flat/recommended-typescript-error"],
      promise.configs["flat/recommended"],
      regexp.configs["flat/recommended"],
      n.configs["flat/recommended-module"],
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // Auto-resolves the right tsconfig per file (incl. tests/configs)
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // SECURITY & ROBUSTNESS (Blocks data leaks and bad patterns)
      ...securityErrors,
      "no-console": ["error", { allow: ["warn", "error"] }], // Real loggers, no console.log
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
        { max: 300, skipBlankLines: true, skipComments: true },
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
    },
  },
  // SOURCE ARCHITECTURE: browser production code stays browser-only and cannot reach tests/tooling.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "Production browser code must not import Node built-ins.",
            },
            {
              group: ["../harness/*", "harness/*", "../tests/*", "tests/*"],
              message:
                "Production source cannot import harness or e2e test modules.",
            },
            {
              group: ["*.test", "*.test.*", "*.spec", "*.spec.*"],
              message: "Production source cannot import test modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts"],
    plugins: { "no-only-tests": noOnlyTests },
    rules: {
      "max-lines": "off",
      // describe/it callbacks group many cases; line caps target production spaghetti, not test suites.
      "max-lines-per-function": "off",
      "no-only-tests/no-only-tests": "error",
    },
  },
  // SEPARATION FOR ROOT CONFIGURATIONS
  {
    files: ["**/*.config.ts", "**/vite.config.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // HARNESS: a Node tooling directory that must spawn `git`/`npm` by name (resolved from PATH,
  // which is sanitized of GIT_* in gate.ts). No portable way to absolute-path them; this is the
  // one rule the harness cannot satisfy. Everything else stays enforced.
  // roundTo needs the guaranteed-defined last digit of a known-non-empty array. `.at(-1)` widens the
  // element to `number | undefined`, forcing a banned non-null assertion or an unreachable `?? 0`
  // branch (breaking 100% coverage); indexed access stays clearer here.
  {
    files: ["src/calculator.ts"],
    rules: {
      "unicorn/prefer-at": "off",
    },
  },
  {
    files: ["harness/**/*.ts"],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      // The harness reads staged-file paths computed from git output; no safe literal exists.
      "security/detect-non-literal-fs-filename": "off",
      // preferences.ts takes TypeScript compiler AST nodes, whose API types are not declared
      // readonly, so a clean readonly signature is impossible; off for the whole harness dir.
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      // Conflicts with the jsdoc plugin, which aligns the standard `* ` prefix this rule strips.
      "jsdoc/check-alignment": "off",
      // import.meta.dirname/filename trip n/no-unsupported-features here; keep portable fileURLToPath.
      "unicorn/prefer-import-meta-properties": "off",
    },
  },
  // JSON FAMILY (linted via `npm run json:lint`)
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
  // Prettier owns formatting; disable stylistic rules that would conflict.
  eslintConfigPrettier,
  // Owner decision: no-magic-numbers is impractical for this codebase (it fires 220+ times in
  // src/ on ordinary numeric/index math). Disabled globally; revisit later. Last block wins.
  {
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
  // tseslint/unicorn "all" pull in rules that fight this codebase's domain or add no correctness
  // signal. The curated strict rules above (no-explicit-any, no-unsafe-*, strict-boolean,
  // complexity caps, no-floating-promises, …) remain the real gate. These are off, each justified:
  {
    rules: {
      // The UI models snake_case query-string / backend field names (parameters_b, weight_bits,
      // active_parameters_b). Enforcing camelCase everywhere fights the domain (293 hits).
      "@typescript-eslint/naming-convention": "off",
      // Deep-readonly every parameter is impractical here (115 hits) and not a correctness rule.
      "@typescript-eslint/prefer-readonly-parameter-types": "off",
      // Mandatory JSDoc on every symbol is documentation policy, not a correctness gate.
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-returns": "off",
      "jsdoc/require-param-description": "off",
      // Conflicts with the jsdoc plugin, which endorses the standard `* ` prefix this rule strips.
      "unicorn/no-asterisk-prefix-in-documentation-comments": "off",
      // The app interoperates with DOM/History APIs and uses null as an explicit sentinel
      // (DeploymentSpec.active_parameters_b, history.replaceState(null, …)) distinct from undefined.
      "unicorn/no-null": "off",
      // High false-positive rate: fires on ordinary numeric array indexing (kept[index]), not a
      // real object-injection vector in this typed code. eslint-plugin-security stays enabled.
      "security/detect-object-injection": "off",
      // The render layer deliberately builds pre-escaped HTML strings (escapeHtml in render.ts) and
      // assigns innerHTML; escaping is covered by the reflected-XSS e2e test in tests/.
      "unicorn/no-unsafe-dom-html": "off",
      "unicorn/prefer-dom-node-html-methods": "off",
      // Member ordering is stylistic; this rule's order (private before public) conflicts with the
      // public-API-first convention used in CalculatorApp.
      "unicorn/consistent-class-member-order": "off",
    },
  },
  // Test files exercise edge cases and build hostile fixtures; rules that guard production code
  // are noise against mocks, exact-value float assertions, null checks, and DOM fixtures.
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@typescript-eslint/max-params": "off",
      "@typescript-eslint/strict-void-return": "off",
      // Tests assert exact computed numbers and null returns, and sort small string arrays.
      "sonarjs/no-floating-point-equality": "off",
      "unicorn/no-null": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/require-array-sort-compare": "off",
      "sonarjs/no-alphabetical-sort": "off",
      "unicorn/prefer-iterator-concat": "off",
      "unicorn/max-nested-calls": "off",
      "sonarjs/prefer-specific-assertions": "off",
      // Tests build DOM fixtures and chained matchers (new AxeBuilder({ page }).analyze()).
      "unicorn/no-unsafe-dom-html": "off",
      "unicorn/prefer-dom-node-html-methods": "off",
      "unicorn/no-unreadable-new-expression": "off",
      // @axe-core/playwright exports AxeBuilder as its default; the default import is correct usage.
      "import-x/no-named-as-default": "off",
    },
  },
]);
