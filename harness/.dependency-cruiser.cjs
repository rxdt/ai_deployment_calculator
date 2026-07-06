/**
 * Architecture rules for the frontend TypeScript sources.
 * `pnpm lint:arch` runs `depcruise src --output-type err`, so only
 * `error`-severity violations fail the gate.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Do not allow circular dependencies. They make modules difficult to untangle.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "production-not-to-tests",
      comment: "Production modules must never import test or spec files.",
      severity: "error",
      from: { pathNot: "\\.(test|spec)\\.ts$" },
      to: { path: "\\.(test|spec)\\.ts$" },
    },
    {
      name: "no-orphans",
      comment:
        "Unreferenced modules are dead weight (entry points and type/test files are exempt).",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: ["\\.(test|spec)\\.ts$", "src/main\\.ts$", "src/types\\.ts$"],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "harness/tsconfig.app.json",
    },
  },
};
