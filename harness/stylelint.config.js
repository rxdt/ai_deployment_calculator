export default {
  extends: ["stylelint-config-standard"],
  plugins: [
    "stylelint-declaration-strict-value",
    "stylelint-media-use-custom-media",
    "stylelint-plugin-defensive-css",
  ],
  ignoreFiles: [
    "../**/coverage/**",
    "../**/dist/**",
    "../**/build/**",
    "../**/.next/**",
    "../**/node_modules/**",
    "../**/scratchpad/**",
  ],
  rules: {
    "at-rule-no-unknown": true,
    "at-rule-disallowed-list": ["custom-media"],
    "block-no-empty": true,
    "custom-property-pattern":
      "^(background|color|font|layout|radius|shadow|space|z)-[a-z0-9-]+$",
    "csstools/media-use-custom-media": "never",
    // Defensive CSS: enforce responsive units + accessibility defenses
    "defensive-css/no-fixed-sizes": true, // Flexible units on sizing + responsive at-rules
    "defensive-css/no-unsafe-clamp-font-size": true, // WCAG-safe fluid clamp() ratios
    "defensive-css/require-focus-visible": true, // Keyboard-visible focus, not bare :focus
    "defensive-css/require-prefers-reduced-motion": true, // Wrap motion in reduced-motion query
    "declaration-no-important": true, // Banned: Block using lazy '!important' overrides
    "declaration-property-value-disallowed-list": {
      "font-size": ["/^[0-9.]+px$/"],
      "z-index": ["/^[0-9]+$/"],
      "/^(background|background-image)$/": [
        "/#[0-9a-fA-F]{3,8}/",
        "/\\brgb\\(/",
        "/\\b\\d+(\\.\\d+)?(px|rem|em)\\b/",
      ],
      outline: ["none", "0"],
      "/^overflow(-x|-y)?$/": ["hidden", "clip"],
      position: ["fixed"],
      transition: ["/\\ball\\b/"],
      "transition-property": ["all"],
      "/^(width|height|min-width|max-width|min-height|max-height|grid-template-columns|inset|top|right|bottom|left)$/":
        ["/\\b\\d+(\\.\\d+)?(px|rem|em)\\b/"],
    },
    "import-notation": null,
    "max-nesting-depth": 2, // Stop messy CSS nesting chains
    "declaration-property-unit-allowed-list": {
      "font-size": ["rem", "em"], // Never px font sizes
      "line-height": [], // Unitless line-height only
      "/^(width|min-width|max-width)$/": ["%", "rem", "em", "vw"],
    },
    "media-query-no-invalid": true,
    "media-feature-name-no-unknown": true,
    "media-feature-name-value-no-unknown": true,
    "media-feature-name-unit-allowed-list": {
      "/width$/": ["em"], // Content-driven em breakpoints; never px
    },
    "nesting-selector-no-missing-scoping-root": null,
    "color-named": "never", // Force hex or rgb colors, lazy words like "red"
    "selector-max-id": 0, // Force clean selectors over high-pri ID e.g. #my-header
    "selector-class-pattern": "^[a-z0-9\\-]+$", // force lowercase, no CSS conflicts
    "declaration-block-no-duplicate-properties": true,
    "unit-allowed-list": ["rem", "%", "ms", "deg", "em", "vw", "vh"], // px banned globally
    "unit-no-unknown": true,
    "declaration-block-no-redundant-longhand-properties": true,
    "declaration-block-single-line-max-declarations": 1,
    "font-family-no-missing-generic-family-keyword": true,
    "length-zero-no-unit": true,
    "media-feature-range-notation": "context",
    "no-descending-specificity": true,
    "property-no-vendor-prefix": true,
    "property-disallowed-list": ["float", "clear"],
    "selector-max-specificity": "0,3,1",
    "selector-max-compound-selectors": 3,
    "selector-max-class": 3,
    "selector-max-combinators": 2,
    "selector-max-universal": [
      1,
      {
        ignoreAfterCombinators: [">", "+", "~"],
      },
    ],
    "selector-max-pseudo-class": 2,
    "selector-max-type": 1,
    "selector-no-qualifying-type": true,
    "shorthand-property-no-redundant-values": true,
    "scale-unlimited/declaration-strict-value": [
      [
        "/color$/",
        "background-color",
        "border-color",
        "font-size",
        "line-height",
        "border-radius",
        "margin",
        "padding",
        "gap",
        "row-gap",
        "column-gap",
        "z-index",
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
