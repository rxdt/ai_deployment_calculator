import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import process from "node:process";
import { parseDocument } from "yaml";

const approvedAction =
  /^(actions\/(checkout|dependency-review-action|setup-node)|pnpm\/action-setup)@v[0-9]+$/u;
const weakenedGateCommand =
  /(\|\|\s*true|--no-verify|continue-on-error|pnpm\s+run\s+gate)/u;
const unfrozenInstall = /(^|\n)\s*pnpm\s+install(?!.*--frozen-lockfile)(\s|$)/u;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const objectEntries = (value) => (isObject(value) ? Object.entries(value) : []);

const stepEntries = (jobs) =>
  objectEntries(jobs).flatMap(([jobName, job]) =>
    Array.isArray(job?.steps)
      ? job.steps.map((step, index) => ({
          jobName,
          path: `jobs.${jobName}.steps[${index}]`,
          step,
        }))
      : [],
  );

const addViolation = (violations, rule, message) => {
  violations.push({ rule, message });
};

const hasExactRun = (steps, command) =>
  Array.isArray(steps) &&
  steps.some((step) => isObject(step) && step.run === command);

export const validateWorkflow = (workflow) => {
  const violations = [];
  const root = isObject(workflow) ? workflow : {};
  const jobs = root.jobs;
  const steps = stepEntries(jobs);

  if (!root.name) {
    addViolation(
      violations,
      "workflow-has-name",
      "GitHub Actions workflows must have a name.",
    );
  }

  if (!jobs) {
    addViolation(
      violations,
      "workflow-has-jobs",
      "GitHub Actions workflows must define at least one job.",
    );
  }

  if (Object.hasOwn(root, "permissions")) {
    const contents = isObject(root.permissions)
      ? root.permissions.contents
      : undefined;
    if (typeof contents !== "string" || !/^read$/u.test(contents)) {
      addViolation(
        violations,
        "workflow-uses-read-only-contents",
        "Workflows must keep default token contents permission read-only.",
      );
    }
  }

  if (isObject(root.on) && root.on.pull_request_target) {
    addViolation(
      violations,
      "workflow-forbids-pull-request-target",
      "pull_request_target runs untrusted PR code with elevated token context.",
    );
  }

  for (const [jobName, job] of objectEntries(jobs)) {
    if (isObject(job) && job["continue-on-error"]) {
      addViolation(
        violations,
        "workflow-jobs-must-not-continue-on-error",
        `jobs.${jobName}.continue-on-error must be falsy.`,
      );
    }
  }

  for (const { path, step } of steps) {
    if (!isObject(step)) {
      continue;
    }

    if (step["continue-on-error"]) {
      addViolation(
        violations,
        "workflow-steps-must-not-continue-on-error",
        `${path}.continue-on-error must be falsy.`,
      );
    }

    if (
      Object.hasOwn(step, "uses") &&
      (typeof step.uses !== "string" || !approvedAction.test(step.uses))
    ) {
      addViolation(
        violations,
        "workflow-actions-are-approved-and-pinned",
        `${path}.uses must be an approved action pinned to a major version.`,
      );
    }

    if (
      Object.hasOwn(step, "run") &&
      (typeof step.run !== "string" || weakenedGateCommand.test(step.run))
    ) {
      addViolation(
        violations,
        "workflow-run-commands-do-not-weaken-gate",
        `${path}.run must not bypass or weaken gate execution.`,
      );
    }

    if (step.uses !== "actions/setup-node@v4" || !Object.hasOwn(step, "with")) {
      continue;
    }

    const options = isObject(step.with) ? step.with : {};
    if (options["node-version"] !== 24 && options["node-version"] !== "24") {
      addViolation(
        violations,
        "workflow-uses-node-24",
        `${path}.with.node-version must be 24.`,
      );
    }
    if (options["cache-dependency-path"] !== "pnpm-lock.yaml") {
      addViolation(
        violations,
        "workflow-caches-root-package-lock",
        `${path}.with.cache-dependency-path must be pnpm-lock.yaml.`,
      );
    }
  }

  for (const { path, step } of steps) {
    if (
      isObject(step) &&
      typeof step.run === "string" &&
      unfrozenInstall.test(step.run)
    ) {
      addViolation(
        violations,
        "workflow-installs-dependencies-frozen",
        `${path}.run must use pnpm install --frozen-lockfile.`,
      );
    }
  }

  if (Object.hasOwn(root, "jobs")) {
    const checks = isObject(jobs) ? jobs.checks : undefined;
    if (!checks) {
      addViolation(
        violations,
        "workflow-has-generic-checks-job",
        "CI must expose its main quality job as a generic checks job.",
      );
    }

    const checkSteps = isObject(checks) ? checks.steps : undefined;
    for (const [rule, command] of [
      ["workflow-installs-root-workspace", "pnpm install --frozen-lockfile"],
      [
        "workflow-installs-browsers-through-harness",
        "pnpm --prefix harness run setup:e2e -- chromium webkit",
      ],
      ["workflow-runs-harness-gate", "node harness/harness.mjs gate"],
    ]) {
      if (!hasExactRun(checkSteps, command)) {
        addViolation(
          violations,
          rule,
          `jobs.checks.steps must include \`${command}\`.`,
        );
      }
    }
  }

  return violations;
};

export const lintWorkflow = (source) => {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    return document.errors.map((error) => ({
      rule: "workflow-valid-yaml",
      message: error.message,
    }));
  }

  return validateWorkflow(document.toJS());
};

const main = async () => {
  const [workflowPath] = process.argv.slice(2);
  if (!workflowPath) {
    console.error("Usage: node harness/workflow-lint.mjs <workflow.yml>");
    process.exitCode = 2;
    return;
  }

  const source = await readFile(workflowPath, "utf8");
  const violations = lintWorkflow(source);
  if (violations.length === 0) {
    return;
  }

  for (const { rule, message } of violations) {
    console.error(`${workflowPath}: [${rule}] ${message}`);
  }
  process.exitCode = 1;
};

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
