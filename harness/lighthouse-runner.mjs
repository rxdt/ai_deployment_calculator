import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const harnessDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(harnessDirectory, "..");
const frontendDirectory = resolve(repositoryDirectory, "frontend");
const outputDirectory = resolve(frontendDirectory, ".lighthouseci");
const previewHost = "127.0.0.1";
const previewPort = 4184;
const previewUrl = `http://${previewHost}:${previewPort}/`;
const previewTimeout = 10_000;
const runs = 3;
const minimumScore = 0.9;
const recommendedCategories = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
];
const chromeFlags =
  "--headless --no-sandbox --disable-features=HttpsFirstBalancedModeAutoEnable,HttpsUpgrades,SafeBrowsing";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: previewHost, port: previewPort });
    const close = (isOpen) => {
      socket.destroy();
      resolve(isOpen);
    };

    socket.once("connect", () => close(true));
    socket.once("error", () => close(false));
    socket.setTimeout(500, () => close(false));
  });
}

async function waitForPreview(preview) {
  const deadline = Date.now() + previewTimeout;

  while (Date.now() < deadline) {
    if (preview.exitCode !== null) {
      throw new Error(`Preview server exited with code ${preview.exitCode}.`);
    }

    if (await isPortOpen()) {
      return;
    }

    await delay(100);
  }

  throw new Error(
    `Preview server did not open ${previewUrl} within ${previewTimeout}ms.`,
  );
}

function run(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, options);

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`,
        ),
      );
    });
  });
}

function startPreview() {
  return spawn(
    "pnpm",
    [
      "--prefix",
      "harness",
      "exec",
      "vite",
      "preview",
      "--config",
      "vite.config.ts",
      "--host",
      previewHost,
      "--port",
      String(previewPort),
    ],
    {
      cwd: repositoryDirectory,
      detached: process.platform !== "win32",
      stdio: "inherit",
    },
  );
}

async function stopPreview(preview) {
  if (preview.exitCode !== null || preview.pid === undefined) {
    return;
  }

  if (process.platform === "win32") {
    preview.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-preview.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
}

async function runLighthouse(runNumber) {
  const reportPath = resolve(outputDirectory, `lighthouse-${runNumber}.json`);

  await run(
    "lighthouse",
    [
      previewUrl,
      "--quiet",
      "--output=json",
      `--output-path=${reportPath}`,
      `--chrome-flags=${chromeFlags}`,
    ],
    { cwd: repositoryDirectory, stdio: "inherit" },
  );

  return JSON.parse(await readFile(reportPath, "utf8"));
}

function assertRecommendedQuality(report, runNumber) {
  const failures = recommendedCategories.flatMap((category) => {
    const result = report.categories?.[category];
    const score = result?.score;

    if (typeof score !== "number" || score < minimumScore) {
      const percentage =
        typeof score === "number" ? Math.round(score * 100) : "missing";
      return [`run ${runNumber}: ${category} score ${percentage} (minimum 90)`];
    }

    return [];
  });

  if (failures.length > 0) {
    throw new Error(
      `Lighthouse recommended quality check failed:\n${failures.join("\n")}`,
    );
  }
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const preview = startPreview();

  try {
    await waitForPreview(preview);

    for (let runNumber = 1; runNumber <= runs; runNumber += 1) {
      assertRecommendedQuality(await runLighthouse(runNumber), runNumber);
    }
  } finally {
    await stopPreview(preview);
  }
}

await main();
