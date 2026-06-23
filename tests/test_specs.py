from __future__ import annotations

from pathlib import Path

MAX_MARKDOWN_LINES = 100


def markdown_handoff_paths() -> tuple[Path, ...]:
    paths = [Path("AGENTS.md"), Path("PROMPT.md"), Path("README.md")]
    paths.extend(Path("specs").glob("*.md"))
    paths.extend(Path("docs").glob("*.md"))
    return tuple(paths)


def markdown_line_count(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def test_specs_do_not_include_template_placeholder() -> None:
    spec_text = "\n".join(path.read_text(encoding="utf-8") for path in Path("specs").glob("*.md"))
    assert "Example Spec" not in spec_text
    assert "DELETE OR REPLACE" not in spec_text


def test_specs_include_priority_and_acceptance_signals() -> None:
    for path in Path("specs").glob("*.md"):
        spec_text = path.read_text(encoding="utf-8")
        assert "PRIORITY" in spec_text, path
        assert "## Acceptance" in spec_text, path


def test_core_keeps_the_only_pydantic_model() -> None:
    pydantic_users = {
        path.as_posix()
        for path in Path("src").rglob("*.py")
        if "pydantic" in path.read_text(encoding="utf-8")
    }
    assert pydantic_users == {"src/vram_calculator.py"}


def test_project_status_does_not_report_stale_git_blocker() -> None:
    status_text = Path("docs/PROJECT_STATUS.md").read_text(encoding="utf-8")

    assert "Git cannot create `.git/index.lock`" not in status_text
    assert "## Blockers\n- None." in status_text


def test_plan_run_checklist_matches_required_local_checks() -> None:
    plan_text = Path("docs/plan.md").read_text(encoding="utf-8")

    assert "`ruff check . && ruff format --check . && pytest` passes with 100% coverage." in plan_text
    assert "`ruff format .` passes" not in plan_text


def test_markdown_handoff_files_stay_short() -> None:
    too_long = {
        path.as_posix(): line_count
        for path in markdown_handoff_paths()
        if (line_count := markdown_line_count(path)) > MAX_MARKDOWN_LINES
    }

    assert too_long == {}
