# MergeCode Product Spec

## One-Line Pitch

MergeCode evaluates AI-generated patches by whether a maintainer would merge them, not merely whether tests pass.

## Problem

AI coding agents are increasingly good at producing patches that satisfy visible tests. But test-passing is not the same as mergeable. A maintainer may reject a patch because it:

- fixes the symptom but changes public behavior
- deletes or weakens tests
- edits unrelated files
- introduces architectural drift
- adds unnecessary dependencies
- duplicates existing logic
- hides failures behind broad exception handling
- creates a diff that is too large or hard to review

Existing evals often compress the outcome into pass/fail. MergeCode keeps the engineering judgment visible.

## Non-Goals

- Not a generic linter.
- Not a replacement for human maintainers.
- Not a benchmark leaderboard first.
- Not a black-box LLM judge with no evidence.
- Not a full CI platform.
- Not an IDE extension in the first spine.

## Target User

- Engineers reviewing AI-generated patches.
- Teams evaluating coding-agent quality.
- Researchers building agent evals.
- Open-source maintainers receiving AI-generated PRs.

## The One Thing That Makes It Tremendous

MergeCode should surface cases where **tests pass but the patch is not mergeable**, then explain why with concrete evidence a senior engineer accepts.

The project succeeds when a reviewer says:

> "This is exactly the gap I feel when agents produce green but ugly PRs."

## Core User Flow

1. User provides a repo, task description, and patch.
2. MergeCode creates an isolated worktree.
3. MergeCode applies the patch.
4. MergeCode runs verification commands.
5. MergeCode analyzes the diff and repo context.
6. MergeCode produces a verdict with evidence.

## Verdicts

### MERGE

Patch is correct, minimal enough, tested, and aligned with project architecture.

### REQUEST_CHANGES

Patch may be salvageable but needs revisions: missing tests, too broad, risky semantics, weak implementation, unclear reviewability.

### REJECT

Patch is fundamentally wrong, unsafe, unrelated, unreviewable, or fails required verification.

## Success Criteria For The Spine

- Applies patches safely in an isolated worktree.
- Runs configured verification commands.
- Detects deleted tests.
- Detects dependency/config/CI changes.
- Computes diff size and touched-file risk.
- Produces an evidence-backed verdict.
- Generates a Markdown report that is readable in under 30 seconds.

## Success Criteria For "Tremendous"

- Build a fixture set where multiple AI patches pass tests but fail merge-worthiness.
- Publish a writeup with specific failure modes.
- Calibrate the rubric against human review decisions.
- Show agent comparison: same task, different patches, different merge outcomes.

