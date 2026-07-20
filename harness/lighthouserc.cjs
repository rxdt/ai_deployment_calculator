module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm --prefix frontend run preview -- --port 4184",
      startServerReadyPattern: "Local:",
      startServerReadyTimeout: 10000,
      url: ["http://127.0.0.1:4184/"],
      numberOfRuns: 3,
      settings: {
        chromeFlags:
          "--headless --no-sandbox --disable-features=HttpsFirstBalancedModeAutoEnable,HttpsUpgrades,SafeBrowsing",
      },
    },
    assert: {
      preset: "lighthouse:recommended",
    },
    upload: {
      target: "filesystem",
      outputDir: "./frontend/.lighthouseci",
    },
  },
};
