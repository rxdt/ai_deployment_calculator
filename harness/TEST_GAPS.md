# Harness Test Gaps

Remaining work only. Focus on behavior that would catch weakened structure,
type safety, security, maintainability, or JavaScript/TypeScript best practice.

## 1. `gate.test.ts` Must Challenge `gate.ts`

Edit 14 existing tests:

- Replace stale preflight/gate shape assertions with the harness-owned check map.
- Turn `runGate uses the real checks` and `preflight uses the real checks` into
  proof that configured checks run, fail closed, and report command output.
- Strengthen `runChecks` tests for cwd, stdout/stderr capture, sanitized
  `GIT_*`, missing binaries, and package-root skip behavior.
- Convert command-fragment tests into exact argv assertions with path-existence
  checks for every referenced config.
- Replace text-grep config checks with parsed config or tool-fixture checks.
- Make CI and hook tests assert exact commands, install roots, and JS entrypoints.
- Make package-script tests protect required public commands, not aesthetics.

Add 18 tests:

- Every `FORBIDDEN_FILES` entry is ejected when staged.
- Every `FORBIDDEN_DIRS` entry is ejected for add, modify, delete, and rename.
- `.github`, `.githooks`, `frontend/harness`, harness configs, and lockfiles are
  covered as real staged paths.
- `RALPH_LOOP` only enables containment for the intended value; `"0"`, `"true"`,
  whitespace, and unset stay loop-off if that is the contract.
- Banned patterns are ignored in removed/context lines and caught only in added
  lines.
- Multiple bad files are all unstaged while unrelated staged work survives.
- Rewritten rename/delete+add with a banned added file leaves no orphan deletion
  staged.
- Dirty worktree edits survive containment while the index is cleaned.
- `preferenceProblems` checks staged TypeScript only, skips deletions and
  non-TS files, and reports multiple files deterministically.
- Frontend and harness package-lock files are consistent with their manifests.
- `npmPkgJsonLint`, `knip`, `cspell`, `secretlint`, `depcruise`, and
  Playwright/Lighthouse configs are exercised against repo-root paths.
- ESLint fixture failures prove `any`, unsafe code, focused tests, disabled
  rules, test-only imports, and security rules are enforced.
- Full gate contains non-optional type, lint, format, architecture, dead-code,
  spelling, security, audit, coverage, e2e, size, and Lighthouse checks.

## 2. `ralph.sh` Shell Loop

Add real `sh` tests for [ralph.sh](./ralph.sh) with stub `timeout` and agent
binaries.

- usage exits 2 when no agent command is provided
- missing `gtimeout`/`timeout` exits 2
- `gtimeout` is preferred over `timeout`
- `PROMPT.md` is read and piped to the worker
- missing or unreadable `PROMPT.md` behavior is explicit and tested
- default iterations and minutes are `2` and `20`
- non-positive iteration/minute values exit 2
- timeout receives `max_minutes * 60`
- worker non-zero exit propagates and stops the loop
- worker argv passes through verbatim
- `RALPH_LOOP=1` reaches the worker environment
- script remains POSIX `sh`

## 3. Real `harness run` Path

Current `cli.ts` tests still lean on injected `worker`, `listSequences`, and
`ensureDirectory`. Keep unit tests, but add integration tests with a stub agent.

- child stdout and stderr tee to terminal output and JSONL log
- partial-line tails flush on process close
- worker exit code propagates
- child spawn errors are reported
- `formatLiveLine` uses the `jq` branch when `jq` is on `PATH`
- real sequence detection increments past existing `NNNN.jsonl` logs
- run directory is created on disk
- positional `false` disables verbose streaming
- `main()` writes status lines to stderr and sets `process.exitCode`
