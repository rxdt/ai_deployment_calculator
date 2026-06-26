"""Integration tests for harness containment.

Two layers, no reimplementation of the shipped hook:

* Layer 1 (behavioral): call ``gate.run_preflight`` directly against a real temp git repo. The only
  stub is ``gate.run_checks`` (ruff/format — a separate concern covered in test_gate.py), patched
  in-process. ``RALPH_LOOP`` is set explicitly per test, never inherited, so the result is a pure
  function of the test's inputs and identical for any runner.
* Layer 2 (contract): real ``git commit``s run the shipped ``.githooks/pre-commit``. Each test proves the
  real CLI actually executed by asserting on output only it emits — ``ok: preflight passed`` /
  ``rejected by harness`` (cli.py) and ``harness kept forbidden paths out of the commit:`` (gate.py) — not
  by inferring from git side-effects. The subprocess env is built from a fixed allowlist, never inherited.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import (
    REPO_ROOT,
    commit,
    committed_file_names,
    get_staged_file_names,
    run_cmd,
    stage_files,
    stubbed_run_checks,
    write_unstaged,
)

from harness import gate

# A module that passes the repo's *real* strict ruff config (docstring, clean format), so a commit's only
# variable is containment — not a weakened gate. ``x=1\n`` below is the deliberate counter-example.
CLEAN = '"""ok."""\n'


# --- Layer 1: behavioral containment, run_preflight called directly ------------------------------


def test_loop_ejects_forbidden_file_keeps_work(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "pyproject.toml", "x = 1\n")  # FORBIDDEN_FILES
    stage_files(git_repo, "src/feature.py", "y = 2\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["src/feature.py"]  # forbidden ejected, real work kept


def test_loop_ejects_forbidden_dir_keeps_work(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "harness/evil.py", "x = 1\n")  # FORBIDDEN_DIRS
    stage_files(git_repo, "src/feature.py", "y = 2\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["src/feature.py"]


def test_loop_flags_banned_pattern_without_ejecting(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "src/x.py", "y = 1  # noqa\n")
    assert "banned pattern 'noqa' in line: y = 1  # noqa" in gate.run_preflight(git_repo)
    assert get_staged_file_names(git_repo) == ["src/x.py"]  # content, not a path: not ejected


def test_loop_flags_banned_pattern_case_insensitively(
    monkeypatch: pytest.MonkeyPatch, git_repo: Path
) -> None:
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "src/x.py", "y = 1  # NOQA\n")  # mixed case must still be caught
    assert "banned pattern 'noqa' in line: y = 1  # NOQA" in gate.run_preflight(git_repo)


def test_loop_flags_preference_break(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "src/p.py", "_hidden = 1\n")
    assert "src/p.py:1: name '_hidden' starts with underscore" in gate.run_preflight(git_repo)
    assert get_staged_file_names(git_repo) == ["src/p.py"]


def test_loop_rejects_when_empty_after_ejection(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    """Under the loop, staging only a forbidden file ejects it; the now-empty index is rejected."""
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "pyproject.toml", "x = 1\n")  # only a forbidden file is staged
    assert "Empty commits are rejected. Stage real work." in gate.run_preflight(git_repo)
    assert get_staged_file_names(git_repo) == []  # ejection emptied the index


def test_no_loop_allows_forbidden_file(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "pyproject.toml", "x = 1\n")
    stage_files(git_repo, "src/feature.py", "y = 2\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["pyproject.toml", "src/feature.py"]  # containment is loop-only


def test_no_loop_allows_forbidden_dir(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "harness/evil.py", "x = 1\n")
    stage_files(git_repo, "src/feature.py", "y = 2\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["harness/evil.py", "src/feature.py"]


def test_no_loop_ignores_banned_pattern(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "src/x.py", "y = 1  # noqa\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["src/x.py"]


def test_no_loop_ignores_preference_break(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    stage_files(git_repo, "src/p.py", "_hidden = 1\n")
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == ["src/p.py"]


def test_no_loop_does_not_reject_empty(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    """The empty-commit guard is loop-only now: with the loop off, an empty index is not flagged here."""
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    assert gate.run_preflight(git_repo) == []  # nothing staged, loop off: no containment, no empty guard
    assert get_staged_file_names(git_repo) == []


def test_no_loop_ignores_unstaged_work(monkeypatch: pytest.MonkeyPatch, git_repo: Path) -> None:
    """Preflight reads the index, not the worktree: unstaged edits don't count toward a commit."""
    monkeypatch.setenv("RALPH_LOOP", "")  # loop off (empty == falsy), set explicitly — never deleted
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    write_unstaged(git_repo, "src/new.py", "y = 2\n")  # untracked, never `git add`-ed
    (git_repo / "README.md").write_text("changed but unstaged\n", encoding="utf-8")  # tracked, modified
    assert gate.run_preflight(git_repo) == []
    assert get_staged_file_names(git_repo) == []  # nothing staged despite a dirty worktree


def test_loop_ignores_unstaged_forbidden_and_banned_content(
    monkeypatch: pytest.MonkeyPatch, git_repo: Path
) -> None:
    """Even under the loop, containment only sees the index: unstaged forbidden/banned files are untouched."""
    monkeypatch.setenv("RALPH_LOOP", "1")
    monkeypatch.setattr(gate, "run_checks", stubbed_run_checks)
    write_unstaged(git_repo, "harness/evil.py", "x = 1\n")  # forbidden path, but unstaged
    write_unstaged(git_repo, "src/x.py", "y = 1  # noqa\n")  # banned pattern, but unstaged
    problems = gate.run_preflight(git_repo)
    assert not any("banned pattern" in problem for problem in problems)  # the worktree is never scanned
    assert get_staged_file_names(git_repo) == []
    assert (git_repo / "harness" / "evil.py").exists()  # nothing ejected; the file is left alone


# --- Layer 2: contract, the real wiring and the real CLI -----------------------------------------


def test_shipped_hook_actually_runs_harness_preflight(seeded_repo: Path) -> None:
    """Proof the shipped hook executes the real CLI: a real commit emits the CLI's own success marker.

    ``ok: preflight passed`` is printed only by ``harness preflight`` (cli.py:75) — a string grep of the
    hook file could never show this. Its presence means the hook actually ran the CLI end to end.
    """
    stage_files(seeded_repo, "src/feature.py", CLEAN)
    result = commit(seeded_repo, "real work", loop=False)
    assert result.returncode == 0, result.stderr
    assert "ok: preflight passed" in result.stderr  # the real CLI ran and reported success
    assert committed_file_names(seeded_repo) == ["src/feature.py"]


def test_loop_commit_drops_forbidden_keeps_work(seeded_repo: Path) -> None:
    """Real commit under the loop: forbidden path ejected, real work lands, working tree untouched.

    Both files are ruff-clean under the *real* config, so the commit succeeds on containment alone.
    """
    stage_files(seeded_repo, "harness/evil.py", CLEAN)
    stage_files(seeded_repo, "src/feature.py", CLEAN)
    result = commit(seeded_repo, "work beside evil", loop=True)
    assert result.returncode == 0, result.stderr
    # The CLI's own containment + success markers prove harness preflight actually ran inside the hook.
    assert "harness kept forbidden paths out of the commit: harness/evil.py" in result.stderr
    assert "ok: preflight passed" in result.stderr
    assert committed_file_names(seeded_repo) == ["src/feature.py"]  # forbidden absent from the commit
    assert (seeded_repo / "harness" / "evil.py").exists()  # but kept in the working tree, not reverted


def test_no_loop_commit_keeps_forbidden(seeded_repo: Path) -> None:
    """Without RALPH_LOOP (a human), the same forbidden path is committed — containment is loop-only."""
    stage_files(seeded_repo, "harness/evil.py", CLEAN)
    stage_files(seeded_repo, "src/feature.py", CLEAN)
    result = commit(seeded_repo, "human edit", loop=False)
    assert result.returncode == 0, result.stderr
    assert "ok: preflight passed" in result.stderr  # the hook ran the CLI...
    assert "harness kept forbidden paths" not in result.stderr  # ...but loop-off, so containment didn't
    assert "harness/evil.py" in committed_file_names(seeded_repo)


def test_no_verify_bypasses_the_hook(seeded_repo: Path) -> None:
    """--no-verify skips the hook entirely: containment is best-effort, not a jail."""
    stage_files(seeded_repo, "harness/evil.py", CLEAN)
    result = commit(seeded_repo, "bypass", loop=True, no_verify=True)
    assert result.returncode == 0, result.stderr
    # Neither CLI marker appears -> positive proof harness preflight never executed (the hook was skipped).
    assert "ok: preflight passed" not in result.stderr
    assert "rejected by harness" not in result.stderr
    assert "harness/evil.py" in committed_file_names(seeded_repo)  # forbidden path landed: hook never ran


def test_loop_commit_blocked_by_banned_pattern(seeded_repo: Path) -> None:
    """A banned pattern can't be ejected, so the real hook rejects — with the real checks otherwise passing.

    The file is ruff-clean (docstring, valid constant), so the *only* reason for rejection is containment.
    """
    stage_files(seeded_repo, "src/x.py", '"""ok."""\n\nHOOKS = "hooksPath"\n')
    result = commit(seeded_repo, "sneaky", loop=True)
    assert result.returncode != 0
    assert "banned pattern 'hooksPath' in line: HOOKS = \"hooksPath\"" in result.stderr
    assert "rejected by harness" in result.stderr  # the real CLI emitted its rejection verdict
    assert "sneaky" not in run_cmd(["git", "log", "--oneline"], seeded_repo)  # the commit never happened


def test_commit_rejected_by_real_format_check(seeded_repo: Path) -> None:
    """The lint/format gate runs for everyone: a misformatted file is rejected by the real ruff, no loop."""
    stage_files(seeded_repo, "src/bad.py", "x=1\n")  # real `ruff format --check` wants `x = 1`
    result = commit(seeded_repo, "ugly", loop=False)
    assert result.returncode != 0
    assert "format failed" in result.stderr
    assert "rejected by harness" in result.stderr  # the real CLI ran and rejected
    assert "ugly" not in run_cmd(["git", "log", "--oneline"], seeded_repo)  # nothing landed


def test_seeded_gate_is_the_real_strict_config(seeded_repo: Path) -> None:
    """Regression guard: never again weaken the seeded gate into a permissive stand-in.

    ``y = 2`` is perfectly formatted, so a toy ``[tool.ruff] line-length`` config (my earlier mistake)
    would let it commit. The real config rejects it for a missing docstring — so this fails the moment the
    seeded gate stops being the repo's own. The byte-for-byte check pins the config itself.
    """
    assert (seeded_repo / "pyproject.toml").read_text(encoding="utf-8") == (
        REPO_ROOT / "pyproject.toml"
    ).read_text(encoding="utf-8")  # the real gate, copied verbatim, not a substitute
    stage_files(seeded_repo, "src/slips.py", "y = 2\n")  # would slip past a weakened gate
    result = commit(seeded_repo, "would slip a weak gate", loop=False)
    assert result.returncode != 0
    assert "Missing docstring in public module" in result.stderr  # only the real strict D-rules catch this
    assert "rejected by harness" in result.stderr  # the real CLI ran and rejected
