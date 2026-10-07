import { describe, expect, test } from "vitest";

interface Workflow {
  name?: string;
  on?: WorkflowEvents;
  permissions?: WorkflowPermissions;
  jobs?: WorkflowJobs;
}

interface WorkflowEvents {
  push?: null;
  pull_request_target?: Record<string, never>;
}

interface WorkflowPermissions {
  contents?: string;
}

interface WorkflowJobs {
  checks?: WorkflowJob;
  verify?: WorkflowJob;
}

interface WorkflowJob {
  "continue-on-error"?: boolean;
  steps?: WorkflowStep[];
}

interface WorkflowStep {
  "continue-on-error"?: boolean;
  run?: string;
  uses?: string;
  with?: NodeSetup;
}

interface NodeSetup {
  "cache-dependency-path"?: string;
  "node-version"?: number;
}

interface WorkflowViolation {
  message: string;
  rule: string;
}

interface WorkflowLinter {
  lintWorkflow: (source: string) => WorkflowViolation[];
  validateWorkflow: (workflow: unknown) => WorkflowViolation[];
}

const isWorkflowLinter = (value: unknown): value is WorkflowLinter => {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "lintWorkflow") === "function" &&
    typeof Reflect.get(value, "validateWorkflow") === "function"
  );
};

const workflowModule: unknown = await import(
  new URL("workflow-lint.mjs", import.meta.url).href
);

if (!isWorkflowLinter(workflowModule)) {
  throw new TypeError("workflow lint module has an invalid interface");
}

const { lintWorkflow, validateWorkflow } = workflowModule;

const validWorkflow: Workflow = {
  name: "CI",
  on: { push: null },
  permissions: { contents: "read" },
  jobs: {
    checks: {
      steps: [
        { uses: "actions/checkout@v4" },
        { uses: "pnpm/action-setup@v4" },
        {
          uses: "actions/setup-node@v4",
          with: {
            "node-version": 24,
            "cache-dependency-path": "pnpm-lock.yaml",
          },
        },
        { run: "pnpm install --frozen-lockfile" },
        { run: "pnpm --prefix harness run setup:e2e -- chromium webkit" },
        { run: "node harness/harness.mjs gate" },
      ],
    },
  },
};

const ruleNames = (workflow: Workflow): string[] =>
  validateWorkflow(workflow).map(({ rule }) => rule);

describe("workflow lint", () => {
  test("accepts the required workflow shape from YAML", () => {
    expect(
      lintWorkflow(`
name: CI
on:
  push:
permissions:
  contents: read
jobs:
  checks:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm --prefix harness run setup:e2e -- chromium webkit
      - run: node harness/harness.mjs gate
`),
    ).toEqual([]);
  });

  test("reports every preserved Spectral policy", () => {
    const pullRequestTarget = "pull_request_target";
    const workflow: Workflow = {
      ...validWorkflow,
      name: "",
      permissions: { contents: "write" },
      on: { [pullRequestTarget]: {} },
      jobs: { verify: { "continue-on-error": true } },
    };

    expect(ruleNames(workflow)).toEqual(
      expect.arrayContaining([
        "workflow-has-name",
        "workflow-uses-read-only-contents",
        "workflow-forbids-pull-request-target",
        "workflow-jobs-must-not-continue-on-error",
        "workflow-has-generic-checks-job",
        "workflow-installs-root-workspace",
        "workflow-installs-browsers-through-harness",
        "workflow-runs-harness-gate",
      ]),
    );
  });

  test("rejects each step-level policy", () => {
    const workflow: Workflow = {
      ...validWorkflow,
      jobs: {
        checks: {
          steps: [
            { "continue-on-error": true, uses: "evil/action@v1" },
            {
              run: "pnpm run gate || true",
              uses: "pnpm/action-setup@v4",
            },
            {
              uses: "actions/setup-node@v4",
              with: {
                "cache-dependency-path": "harness/pnpm-lock.yaml",
                "node-version": 22,
              },
            },
            { run: "pnpm install" },
            { run: "pnpm --prefix harness run setup:e2e -- chromium webkit" },
            { run: "node harness/harness.mjs gate" },
          ],
        },
      },
    };

    expect(ruleNames(workflow)).toEqual(
      expect.arrayContaining([
        "workflow-steps-must-not-continue-on-error",
        "workflow-actions-are-approved-and-pinned",
        "workflow-run-commands-do-not-weaken-gate",
        "workflow-uses-node-24",
        "workflow-caches-root-package-lock",
        "workflow-installs-dependencies-frozen",
      ]),
    );
  });

  test("requires jobs", () => {
    expect(ruleNames({ name: "CI" })).toContain("workflow-has-jobs");
  });
});
