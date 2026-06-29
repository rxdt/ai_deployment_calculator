module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run preview -- --port 4173",
      startServerReadyPattern: "Local:",
      startServerReadyTimeout: 10000,
      url: ["http://127.0.0.1:4173/"],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--headless --no-sandbox",
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      },
    },
    assert: {
      preset: "lighthouse:recommended",
      assertions: {
        "categories:accessibility": ["error", { minScore: 1.0 }],
        "categories:best-practices": ["error", { minScore: 1.0 }],
        "categories:performance": ["warn", { minScore: 1.0 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "csp-xss": "error",
        "is-crawlable": "error",
        "network-dependency-tree-insight": "off",
        "errors-in-console": "error",
        "font-size": "error",
        "target-size": "error",
        "button-name": "error",
        label: "error",
        "color-contrast": "error",
        "unused-javascript": "warn",
        "total-byte-weight": ["warn", { maxNumericValue: 350000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
