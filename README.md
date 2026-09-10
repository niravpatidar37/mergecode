# MergeCode

**Maintainer-grade evaluation for AI-generated code.**

MergeCode answers the question coding-agent benchmarks usually dodge:

> This patch passes tests. Would a maintainer actually merge it?

AI coding agents increasingly produce test-passing patches that still fail real engineering judgment: brittle fixes, missing tests, scope creep, architectural drift, hidden behavior changes, or unreadable diffs. MergeCode is an open-source eval harness for judging candidate patches the way maintainers review pull requests.

## The 30-Second Demo

```bash
mergecode judge \
  --repo ./fixtures/auth-service \
  --task ./tasks/fix-token-expiry.md \
  --patch ./runs/agent-a.patch
```

Output:

```txt
Verdict: REQUEST_CHANGES
Confidence: 0.82

Why:
- Tests pass, but the patch changes refresh-token expiry semantics.
- The fix touches 9 files for a 2-line bug.
- It deletes a negative auth test instead of satisfying it.
- It introduces duplicate date parsing instead of using existing auth/time.ts.

Maintainer note:
This is not mergeable as-is. Ask for a narrower patch preserving existing expiry behavior and restoring the deleted negative test.
```

That is the core promise: **not another "agent got green tests" benchmark, but a merge-worthiness harness.**

## Why This Is Hard

Merge-worthiness is not a single test result. It is a bundle of engineering signals:

- correctness beyond existing tests
- behavioral compatibility
- diff minimality
- architectural fit
- test quality
- risk surface
- reviewability
- maintainability

Most coding-agent evals stop at execution. MergeCode treats code review as the eval target.

## Shippable Spine

The first impressive version is intentionally narrow:

1. Accept a repo, task, and candidate patch.
2. Apply the patch in an isolated git worktree.
3. Run configured verification commands.
4. Analyze the diff for risk, scope, deleted tests, dependency/config changes, and architectural drift.
5. Produce a verdict: `MERGE`, `REQUEST_CHANGES`, or `REJECT`, with evidence.

If the spine works, it is already useful and demoable.

## Planned CLI

```bash
mergecode init
mergecode judge --repo <path> --task <task.md> --patch <patch.diff>
mergecode compare --repo <path> --task <task.md> --patches ./runs/*.patch
mergecode report --run <run-id>
```

## Documentation

- [Product Spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Evaluation Rubric](docs/evaluation-rubric.md)
- [Build Plan](docs/build-plan.md)
- [Research Notes](docs/research-notes.md)
- [Interview Defense](docs/interview-defense.md)

## What This Proves

MergeCode is designed to demonstrate:

- eval design for AI coding agents
- practical software engineering judgment
- static and dynamic patch analysis
- reproducible harness design
- clear product thinking around an urgent developer-tooling problem

## Install Locally

```bash
git clone https://github.com/mihhhir08/mergecode
cd mergecode
npm install
npm run build
npm link
```

## Current Status

The shippable spine is implemented:

- patch application in an isolated temp workspace
- verification command runner
- unified diff parser
- deleted assertion / skipped test detection
- dependency, config, and CI risk detection
- weighted merge-worthiness rubric
- Markdown report under `.mergecode/runs/<id>/report.md`
- optional LLM maintainer review (Claude) layered on top of the rule-based rubric
- a GitHub Action that judges every PR and comments the verdict

## LLM-Assisted Review

The rule-based rubric catches mechanical signals (scope, deleted tests, dependency changes). It can't judge subtler things like design fit or misleading naming. Enable an LLM pass to add that:

```yaml
# mergecode.yaml
llm:
  enabled: true
  model: claude-sonnet-5
  apiKeyEnv: ANTHROPIC_API_KEY
  maxDiffChars: 12000
```

Set `ANTHROPIC_API_KEY` in your environment (or as a repo secret for CI). The LLM's findings are merged with the rule-based ones, and a high/medium-severity LLM finding downgrades an otherwise-clean `MERGE` to `REQUEST_CHANGES`. If the key is missing or `llm.enabled` is false, this step is skipped entirely — no dependency on the network for the core rubric.

## CI: Judge Every Pull Request

[.github/workflows/mergecode.yml](.github/workflows/mergecode.yml) runs `mergecode judge` on each PR (diffing against the base branch, using the PR title/body as the task) and posts the verdict as a PR comment. It runs on the safe `pull_request` event, so forked PRs never see repo secrets or a write token — for fork PRs the verdict still runs in the log, but the comment step is skipped (GitHub restricts `GITHUB_TOKEN` to read-only there). To also run the LLM pass in CI, add `ANTHROPIC_API_KEY` as a repository secret.

## License

MIT — forked from and inspired by [mihhhir08/mergecode](https://github.com/mihhhir08/mergecode).
