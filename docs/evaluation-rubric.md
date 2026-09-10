# Evaluation Rubric

## Top-Level Categories

MergeCode scores patches across six categories. The score is not the product; the evidence is.

| Category | Weight | What It Measures |
|---|---:|---|
| Correctness | 30 | Does the patch satisfy the task and preserve expected behavior? |
| Tests | 20 | Are relevant tests added/preserved? Were tests weakened or deleted? |
| Scope | 15 | Is the diff minimal and focused? |
| Architecture | 15 | Does the patch fit existing module boundaries and patterns? |
| Risk | 10 | Does it touch sensitive surfaces: auth, deps, CI, secrets, migrations? |
| Maintainability | 10 | Is the implementation readable, idiomatic, and reviewable? |

## Hard Gates

These can force `REJECT` or `REQUEST_CHANGES` regardless of score:

- required verification fails
- patch cannot apply
- secrets are introduced
- tests are deleted without replacement
- public API behavior changes without task justification
- unrelated dependency changes
- massive unrelated diff

## Initial Heuristics

### Correctness

- verification commands pass
- changed files are relevant to task keywords
- no broad catch-all exception masking
- no TODO-as-fix patterns

### Tests

- test files added or updated for behavior changes
- no removed assertions unless justified
- no skipped tests added
- no snapshots blindly updated without code reason

### Scope

- changed files count
- changed lines count
- unrelated file categories
- formatting-only churn

### Architecture

- follows existing folder/module patterns
- reuses existing utilities
- avoids duplicate logic
- does not move logic across layers without reason

### Risk

- auth/security files
- dependency files
- lockfiles
- CI config
- migrations
- serialization/schema files

### Maintainability

- function size increase
- cyclomatic-ish branch growth
- naming clarity
- repeated code blocks
- broad global state changes

## Calibration Plan

1. Collect patches from agent runs.
2. Label manually as merge/request/reject.
3. Compare rubric output to human label.
4. Adjust only when evidence supports it.
5. Publish mismatch cases as findings.

## The Dangerous Trap

Do not make MergeCode a vibes-based reviewer. If it cannot cite evidence, it should lower confidence or stay silent.

