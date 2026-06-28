# Harness Test Gaps

Remaining work only.

## 1. `ralph.sh` Shell Loop

Add real `sh` tests for [ralph.sh](./ralph.sh) with stub `timeout` and agent
binaries.

Cover:

- usage exits 2 when no agent command is provided
- missing `gtimeout`/`timeout` exits 2
- `gtimeout` is preferred over `timeout`
- `PROMPT.md` is read and piped to the worker
- missing or unreadable `PROMPT.md` stops the loop
- default iterations and minutes are `2` and `20`
- non-positive iteration/minute values exit 2
- timeout receives `max_minutes * 60`
- worker non-zero exit propagates and stops the loop
- worker argv passes through verbatim
- `RALPH_LOOP=1` reaches the worker environment
- script remains POSIX `sh`

## 2. Real `harness run` Path

Current `cli.ts` tests inject `worker`, `listSequences`, and `ensureDirectory`.
Add integration tests that exercise the real child-process and filesystem path
with a stub agent.

Cover:

- child stdout tees to both terminal output and JSONL log
- partial-line tail flushes on process close
- worker exit code propagates
- child spawn error path is handled
- `formatLiveLine` uses the `jq` branch when `jq` is on `PATH`
- real sequence detection increments past existing `NNNN.jsonl` logs
- run directory is created on disk
- positional `false` disables verbose streaming
- `main()` writes status lines to stderr and sets `process.exitCode`
