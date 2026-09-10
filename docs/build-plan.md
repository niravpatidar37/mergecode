# Build Plan

## Layer 1: Shippable Spine

Goal: a minimal but impressive system that judges one patch against one task in one repo.

### Task 1: Repository Scaffold

- TypeScript CLI
- test runner
- lint/typecheck scripts
- docs
- `mergecode.yaml` schema draft

Done when: `mergecode --help` works and tests run.

### Task 2: Patch Worktree Runner

- create isolated worktree
- apply patch
- capture apply errors
- cleanup option

Done when: fixture patch applies without touching the source repo.

### Task 3: Verification Runner

- run configured commands
- capture status, duration, output summary
- timeout handling

Done when: a failing test produces structured evidence.

### Task 4: Diff Parser

- parse unified diff
- touched files
- added/deleted lines
- file categories
- deleted test detection

Done when: fixture diffs produce stable summaries.

### Task 5: First Rubric Engine

- hard gates
- weighted categories
- findings with evidence
- verdict

Done when: known good/bad fixture patches produce expected verdicts.

### Task 6: Markdown Report

- 30-second summary
- verdict
- why
- verification
- diff risk
- findings

Done when: report is useful without opening source code.

## Layer 2: Depth Roadmap

### Stage A: Real Fixture Corpus

Create 5-10 realistic repo tasks with multiple candidate patches each:

- good patch
- test-passing but bad patch
- failing patch
- overbroad patch

### Stage B: Deleted/Weakened Test Analysis

Detect:

- removed assertions
- `.skip` / `.only`
- snapshot churn
- changed expected values

### Stage C: Architecture Drift

Use repo context:

- existing module map
- similar utility detection
- layer boundary hints
- duplicate logic candidates

### Stage D: Human Calibration

Compare MergeCode verdicts with human labels.

Output:

- confusion matrix
- false positives
- false negatives
- rubric changes

### Stage E: Agent Comparison

Run Claude/Codex/Cursor/Aider patches through same tasks.

Output:

- mergeable rate
- test-pass vs mergeable gap
- recurring failure modes

## Build Rule

Each task must leave the repo working. Do not start Stage B until the spine can produce a complete report.

