import js from "@eslint/js"; // ESLint recommended rules
import globals from "globals"; // Browser/node globals
import react from "eslint-plugin-react"; // React-specific lint 
import reactHooks from "eslint-plugin-react-hooks"; // Hooks correctness 
import reactRefresh from "eslint-plugin-react-refresh"; // Vite fast-refresh safety
import security from "eslint-plugin-security"; // Basic security checks
import tseslint from "typescript-eslint"; // TypeScript ESLint flat-config package
import tailwind from "eslint-plugin-tailwindcss"; // Tailwind class validation
import jsxA11y from "eslint-plugin-jsx-a11y"; // JSX accessibility rules
import { defineConfig, globalIgnores } from "eslint/config"; // ESLint flat-config helpers.



export default defineConfig([
  globalIgnores(["coverage/", "dist/", "build/", ".next/", "node_modules/"]),
  {    
    files: ["**/*.{ts,tsx}"],  // Rules on all TS/JS files
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,  // Use type-checked base rules
      ...tseslint.configs.stylisticTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      tailwind.configs.recommended,  // Auto Tailwind class structure checks
    ], 
    plugins: {
      "react": react,
      "react-hooks": reactHooks,
      "security": security,
      "jsx-a11y": jsxA11y, // accessibility plugin
      "tailwindcss": tailwind,
    },    
    settings: {
      react: {
        version: "19.2",
      },
      tailwindcss: {
        callees: ["classnames", "clsx", "ctl", "cva", "tv", "tw"],
        cssConfigPath: `${import.meta.dirname}/src/index.css`,
      },
    },    
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // Required for strict TypeScript type-aware linting
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
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
      "react-hooks/rules-of-hooks": "error", // Instant fail if break React lifecycle logic
      "react-hooks/exhaustive-deps": "error", // Catch forgotten state updates in useEffect loops
      "react/no-danger": "error",       

      // NO SPAGHETTI
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 3],  
      "max-params": ["error", 4],       // Caps function parameters 
      "complexity": ["error", 10],      // Low carb
      "no-inner-declarations": "error", // Prevent fracturing code into tiny pieces

      // JSSX Semantic Guardrails
      "react/jsx-no-target-blank": "error",  // Prevent security risks in standard links (<a href>)
      "react/jsx-key": "error",  // Force unique keys on loops (prevent UI rendering bugs)       
      "react/no-invalid-html-attribute": "error", // Catch hallucinated HTML attributes
      "react/void-dom-elements-no-children": "error",  // No text inside tags e.g. <input>, <img> 

      // Accessibility (Forces valid interactive markup)
      "jsx-a11y/anchor-is-valid": "error", // Blocks dead or empty links
      "jsx-a11y/no-noninteractive-element-interactions": "error", // Outlaws fake interactive divs, force real <button> tags

      "react/forbid-dom-props": ["error", { "forbid": ["style"] }], // no style in source markup elements

      // MANDATORY RESPONSIVE DESIGN PROPERTY CHECKS
      "tailwindcss/no-custom-classname": ["error", {
        whitelist: ["mono", "hud-label", "hud-panel", "grid-bg", "scanline", "glow-green", "glow-blue", "group\\/.+", "toaster"],
      }],
      "tailwindcss/no-contradicting-classname": "error",
      
      "tailwindcss/no-arbitrary-value": "error",
      // Safety overrides for the Tailwind compiler hooks inside ESLint
      "tailwindcss/classnames-order": "off",
      "tailwindcss/enforces-shorthand": "off",

      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      "react/jsx-no-leaked-render": "error",
      "react/no-array-index-key": "warn",
      "react/no-unstable-nested-components": "error",

      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/alt-text": "error",

      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["../*", "../../*"],
            message: "Use @/ absolute imports inside web/src."
          }
        ],
        paths: [
          {
            name: "@/data/mockData",
            message: "Mock data must not be used as runtime fallback data."
          }
        ]
      }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "max-lines": "off",
    },
  },
  // SEPARATION FOR ROOT CONFIGURATIONS
  {
    files: ['**/*.config.ts', '**/vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node, 
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "no-console": "off"
    }
  }
])
