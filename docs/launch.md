# Phase 4 Launch

Audience: people already running Claude Code, Codex CLI, Gemini CLI, Cursor, and
other agentic coding loops who want less orchestration and more guardrails.

Do not submit until:

- `uvx ralph-harness install my-project` works from PyPI.
- `uvx ralph-harness demo` exists and finishes in under one minute.
- README shows install, uninstall, safety limits, and one real run.
- GitHub release and PyPI page both point at the same version.

## Submission Queue

1. `hesreallyhim/awesome-claude-code`
   - URL: https://github.com/hesreallyhim/awesome-claude-code
   - Scale: ~47k stars; explicit Claude Code users.
   - Route: issue form: `issues/new?template=recommend-resource.yml`.
   - Category: `Tooling` or `Workflows & Knowledge Guides`.
   - Fit: simple guarded agent loop; works with Claude Code, Codex, Gemini.
   - Copy:
     `L∞PS / ralph-harness is a small Python scaffold for running a fresh-context
     coding agent loop with repo-local specs, commit gates, CI, and 100% coverage.
     It is intentionally not an orchestrator: one worker, one prompt, one repo,
     repeat. Install with uvx, try the demo, delete the pieces you do not want.`

2. `RoggeOhta/awesome-codex-cli`
   - URL: https://github.com/RoggeOhta/awesome-codex-cli
   - Scale: ~330 stars; Codex CLI resource list with `Session & Workflow
     Management`, `Cross-Agent Tools`, and `CI/CD & Automation` sections.
   - Route: PR adding one entry after PyPI release.
   - Category: `Session & Workflow Management`.
   - Copy:
     `ralph-harness - Minimal Codex/Claude/Gemini loop scaffold: specs as source
     of truth, fresh-context iterations, git-hook gate, CI verify, and uvx
     install/demo commands.`

3. `DenisSergeevitch/agents-best-practices`
   - URL: https://github.com/DenisSergeevitch/agents-best-practices
   - Scale: ~2k stars; provider-neutral harness design audience.
   - Route: discussion or issue first, not a drive-by PR.
   - Ask: "Would a concrete implementation/example scaffold belong in references?"
   - Angle: Ralph is the small implementation of the quote-level principle:
     the model proposes actions; the repo gate validates commits.

4. `analyticalrohit/awesome-vibe-coding-guide`
   - URL: https://github.com/analyticalrohit/awesome-vibe-coding-guide
   - Scale: ~350 stars; beginner/intermediate AI-coding workflow audience.
   - Route: PR to `setup_and_planning_guide` or `testing_and_debugging_guide`.
   - Angle: not "use my tool"; add a short pattern: plan/spec files plus a
     commit gate beats one long chat.

5. Codex/skill lists
   - `ComposioHQ/awesome-codex-skills`: strong scale, but only submit if Ralph
     ships a real Codex skill.
   - `sickn33/antigravity-awesome-skills`: strong scale, but only submit if Ralph
     ships an installable skill/plugin, not just a repo scaffold.

## Trust Copy

Use this in submissions and short posts:

`New repo, so judge the workflow instead of stars: tiny Python package, MIT,
no token service, no hosted backend, no agent lock-in, local git hooks, CI
backstop, 100% coverage gate, and a demo you can run with uvx.`

Do not say "autonomous framework." Say:

`A guarded loop scaffold for people who already use coding agents.`

## First Week

1. Publish PyPI with Trusted Publishing.
2. Cut `v0.1.1` with `uvx ralph-harness install` and `demo`.
3. Submit Awesome Claude Code issue.
4. Submit Awesome Codex CLI PR.
5. Open one discussion in `agents-best-practices`.
6. Post one real-world run thread after the Loom exists.
