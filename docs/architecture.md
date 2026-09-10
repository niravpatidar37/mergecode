# Architecture

## System Overview

```txt
repo + task + patch
        |
        v
Worktree Manager
        |
        v
Patch Applicator
        |
        v
Verification Runner
        |
        v
Diff Analyzer ---- Repo Context Analyzer
        |                    |
        v                    v
Scoring Engine <------ Evidence Store
        |
        v
Verdict + Markdown/HTML Report
```

## Modules

### `cli`

Command surface:

- `mergecode init`
- `mergecode judge`
- `mergecode compare`
- `mergecode report`

### `worktree`

Responsibilities:

- create isolated git worktree or temp clone
- apply patch
- preserve baseline state
- clean up safely
- store run metadata

Hard part: patch application must be reproducible and non-destructive.

### `verify`

Responsibilities:

- discover or read verification commands
- run commands with timeouts
- capture stdout/stderr summaries
- record exit code and duration

Initial verification sources:

- `mergecode.yaml`
- package scripts
- task metadata

### `diff`

Responsibilities:

- parse unified diffs
- classify touched files
- compute file/line churn
- detect deleted tests
- detect dependency/config/CI changes
- identify renamed/deleted files

### `context`

Responsibilities:

- identify project type
- map existing modules
- find similar functions/files
- detect duplicate implementation patterns
- locate tests related to touched files

Initial version can be heuristic. Later versions use tree-sitter and language-aware analysis.

### `rubric`

Responsibilities:

- convert evidence into score categories
- produce merge/request/reject verdict
- explain tradeoffs
- avoid hiding evidence behind a magic score

### `report`

Responsibilities:

- Markdown report first
- HTML report later
- "review this first" section
- evidence links/file paths

## Data Model

```ts
type Verdict = "MERGE" | "REQUEST_CHANGES" | "REJECT";

interface JudgeRun {
  id: string;
  repoPath: string;
  taskPath: string;
  patchPath: string;
  startedAt: string;
  completedAt?: string;
  verification: VerificationResult[];
  diff: DiffSummary;
  findings: Finding[];
  scores: ScoreBreakdown;
  verdict: Verdict;
}

interface Finding {
  id: string;
  severity: "low" | "medium" | "high";
  category:
    | "correctness"
    | "tests"
    | "scope"
    | "architecture"
    | "risk"
    | "maintainability";
  title: string;
  detail: string;
  file?: string;
  line?: number;
  evidence?: string;
}
```

## Evidence Philosophy

Every negative judgment must point to evidence:

- command failure
- diff line
- file category
- deleted assertion
- changed public interface
- touched config/dependency file
- duplicate logic candidate

No unsupported "this feels bad" findings.

