export default {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-declaration-strict-value"],
  ignoreFiles: [
    "coverage/**",
    "dist/**",
    "build/**",
    ".next/**",
    "node_modules/**",
  ],
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["apply", "custom-variant", "layer", "theme", "utility"],
      },
    ],
    "block-no-empty": true,
    "custom-property-pattern":
      "^(color|space|font|radius|shadow|z|breakpoint)-[a-z0-9-]+$",
    "declaration-no-important": true, // Banned: Block using lazy '!important' overrides
    "declaration-property-value-disallowed-list": {
      "/^font-size$/": ["/^[0-9.]+px$/"],
      "/^z-index$/": ["/^[0-9]+$/"],
    },
    "import-notation": null,
    "max-nesting-depth": 3, // Stop messy CSS nesting chains
    "nesting-selector-no-missing-scoping-root": null,
    "color-named": "never", // Force hex or rgb colors, lazy words like "red"
    "selector-max-id": 0, // Force clean selectors over high-pri ID e.g. #my-header
    "selector-class-pattern": "^[a-z0-9\\-]+$", // force lowercase, no CSS conflicts
    "declaration-block-no-duplicate-properties": true,
    "unit-allowed-list": ["px", "rem", "%", "ms", "deg", "em"],
    "unit-no-unknown": true,
    "declaration-block-no-redundant-longhand-properties": true,
    "declaration-block-single-line-max-declarations": 1,
    "font-family-no-missing-generic-family-keyword": true,
    "length-zero-no-unit": true,
    "media-feature-range-notation": "context",
    "no-descending-specificity": true,
    "property-no-vendor-prefix": true,
    "selector-max-compound-selectors": 4,
    "selector-max-specificity": "0,4,0",
    "shorthand-property-no-redundant-values": true,
    "scale-unlimited/declaration-strict-value": [
      [
        "/color$/",
        "background-color",
        "border-color",
        "font-size",
        "line-height",
        "border-radius",
      ],
      {
        ignoreValues: [
          "inherit",
          "transparent",
          "currentColor",
          "0",
          "none",
          "100%",
        ],
        message: "Use design tokens, not random hardcoded visual values.",
      },
    ],
    "value-no-vendor-prefix": true,
  },
};
