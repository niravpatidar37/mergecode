# Interview Defense Notes

## 5 Hard Questions

### 1. Isn't this just a linter?

No. Linters enforce style and local static rules. MergeCode evaluates candidate patches in context: task, tests, diff, repo architecture, and maintainer rubric. A linter says "this line violates a rule." MergeCode says "this test-passing patch is not mergeable because it changed behavior, weakened tests, and widened scope."

### 2. How do you avoid arbitrary judgments?

Every finding must cite evidence. The rubric starts heuristic but is calibrated against labeled patches. Unsupported subjective claims are either omitted or marked low confidence.

### 3. Why not just ask an LLM to review the diff?

An LLM can explain, but it is not a reproducible harness. MergeCode first gathers deterministic evidence: test results, diff stats, deleted tests, risky files, changed APIs. LLM review can be an optional explanation layer, not the source of truth.

### 4. What is the genuinely hard part?

Calibrating merge-worthiness. Tests are binary; maintainability is not. The hard engineering is turning review judgment into reproducible evidence without drowning users in false positives.

### 5. How do you prove it works?

With a fixture corpus: multiple patches for the same task, human labels, verification results, and MergeCode verdicts. The key metric is not just accuracy; it is whether MergeCode finds non-obvious reject reasons in patches that pass tests.

## Best Talking Point

"The project is about the gap between execution success and engineering acceptance. Coding agents increasingly optimize for green tests, but maintainers merge patches, not test results."

## What A Senior Interviewer May Attack

- False positives
- Overfitting to fixtures
- Whether the rubric is too subjective
- Language/framework coverage
- LLM judge reliability

## Strong Answer

The spine avoids pretending to solve all review judgment. It starts with high-confidence evidence categories: verification, deleted tests, scope, risky files, dependency changes, and architecture reuse. Then it expands only where calibration shows value.

