"""Shared fixtures and helpers for harness tests."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from harness import gate

REPO_ROOT = Path(__file__).resolve().parents[2]


def get_staged_file_names(repo: Path) -> list[str]:
    """Paths currently in the index, via the gate's own git helper."""
    return gate.run_git(repo, ["diff", "--cached", "--name-only"]).split()


def committed_file_names(repo: Path) -> list[str]:
    """Paths in the tip commit's tree."""
    return gate.run_git(repo, ["show", "--name-only", "--format=", "HEAD"]).split()


def stage_files(repo: Path, relpath: str, content: str) -> None:
    """Write CONTENT to RELPATH (creating parents) and stage it."""
    target = repo / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    run_cmd(["git", "add", "--", relpath], repo)


def write_unstaged(repo: Path, relpath: str, content: str) -> None:
    """Write a working-tree file but do NOT stage it; preflight must ignore the worktree."""
    target = repo / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def write_executable(path: Path, text: str) -> None:
    """Write a script and mark it executable (for hook / worker / timeout test shims)."""
    path.write_text(text, encoding="utf-8")
    path.chmod(0o755)


def stubbed_run_checks(repo: Path, checks: object) -> list[str]:
    """Stub gate.run_checks so containment tests do NOT shell out to ruff/pytest etc (a separate concern)."""
    del repo, checks
    return []


def run_cmd(args: list[str], cwd: Path) -> str:
    """Run a command in a directory with hook-safe env, failing the test on error."""
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    result = subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True, env=env)
    return result.stdout


def hermetic_env(*, loop: bool) -> dict[str, str]:
    """Built from scratch so a subprocess outcome can't depend on the ambient environment."""
    env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]}
    if loop:
        env["RALPH_LOOP"] = "1"
    return env


def commit(
    repo: Path, message: str, *, loop: bool, no_verify: bool = False
) -> subprocess.CompletedProcess[str]:
    """Run a real ``git commit`` whose env (and thus RALPH_LOOP) comes only from the allowlist."""
    args = ["git", "commit", "-q", "-m", message]
    if no_verify:
        args.append("--no-verify")
    return subprocess.run(
        args, cwd=repo, capture_output=True, text=True, check=False, env=hermetic_env(loop=loop)
    )


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Provide a git repo with an identity, the tracked git hooks, and a clean initial commit."""
    run_cmd(["git", "init", "-q"], tmp_path)
    run_cmd(["git", "config", "user.email", "harness@test.local"], tmp_path)
    run_cmd(["git", "config", "user.name", "harness-test"], tmp_path)
    hooks = tmp_path / ".githooks"
    hooks.mkdir()
    for hook in ("pre-commit", "pre-push"):
        (hooks / hook).write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
        (hooks / hook).chmod(0o755)
    (tmp_path / "README.md").write_text("seed\n", encoding="utf-8")
    run_cmd(["git", "add", "README.md", ".githooks"], tmp_path)
    run_cmd(["git", "commit", "-q", "-m", "seed"], tmp_path)
    return tmp_path


@pytest.fixture
def seeded_repo(git_repo: Path) -> Path:
    """A real project: the repo's *actual* pyproject + the venv, and the *shipped* pre-commit hook.

    The hook is copied verbatim from the repo's ``.githooks/pre-commit`` (``.venv/bin/harness preflight``);
    with ``.venv`` symlinked to the real environment it runs the actual CLI — real strict ruff config and
    all — end to end, no reimplementation and no weakened checks.
    """
    shutil.copy(REPO_ROOT / "pyproject.toml", git_repo / "pyproject.toml")  # the real gate, not a toy config
    (git_repo / ".venv").symlink_to(REPO_ROOT / ".venv")
    shipped_hook = (REPO_ROOT / ".githooks" / "pre-commit").read_text(encoding="utf-8")
    hook = git_repo / ".githooks" / "pre-commit"
    hook.write_text(shipped_hook, encoding="utf-8")
    hook.chmod(0o755)
    run_cmd(["git", "config", "core.hooksPath", ".githooks"], git_repo)  # actually arm the hook
    return git_repo
