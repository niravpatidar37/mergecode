import type { DiffSummary, Finding, MergeCodeConfig, ScoreBreakdown, Verdict, VerificationResult } from "./types.js";

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function evaluatePatch(input: {
  config: MergeCodeConfig;
  diff: DiffSummary;
  verification: VerificationResult[];
}): { verdict: Verdict; confidence: number; scores: ScoreBreakdown; findings: Finding[] } {
  const findings: Finding[] = [];
  const failedCommands = input.verification.filter((v) => v.exitCode !== 0 || v.timedOut);
  const changedFiles = input.diff.files.length;
  const changedLines = input.diff.totalAdded + input.diff.totalDeleted;

  if (failedCommands.length > 0) {
    findings.push({
      severity: "high",
      category: "correctness",
      title: "Verification failed",
      detail: `${failedCommands.length} verification command(s) failed or timed out.`,
      evidence: failedCommands.map((v) => `${v.command} -> ${v.timedOut ? "timed out" : v.exitCode}`).join("; "),
    });
  }

  if (input.diff.deletedAssertions > 0) {
    findings.push({
      severity: input.config.rubric.hardGates.failOnDeletedTests ? "high" : "medium",
      category: "tests",
      title: "Deleted test assertions",
      detail: `Patch deletes ${input.diff.deletedAssertions} assertion-like line(s) from test files.`,
    });
  }

  if (input.diff.addedSkips > 0) {
    findings.push({
      severity: "high",
      category: "tests",
      title: "Skipped or focused tests added",
      detail: `Patch adds ${input.diff.addedSkips} .skip/.only test marker(s).`,
    });
  }

  if (input.diff.testFilesTouched === 0 && input.diff.files.some((f) => f.category === "source")) {
    findings.push({
      severity: "medium",
      category: "tests",
      title: "Source changed without tests",
      detail: "Source files changed, but no test files were touched.",
    });
  }

  if (changedFiles > 8 || changedLines > 500) {
    findings.push({
      severity: "medium",
      category: "scope",
      title: "Large patch surface",
      detail: `Patch changes ${changedFiles} file(s) and ${changedLines} line(s). Review scope carefully.`,
    });
  }

  for (const file of input.diff.dependencyFilesTouched) {
    findings.push({
      severity: "medium",
      category: "risk",
      title: "Dependency surface changed",
      detail: "Dependency manifests or lockfiles changed.",
      file,
    });
  }

  for (const file of input.diff.ciFilesTouched) {
    findings.push({
      severity: "medium",
      category: "risk",
      title: "CI workflow changed",
      detail: "Automation or release behavior may have changed.",
      file,
    });
  }

  const scores: ScoreBreakdown = {
    correctness: clamp(100 - failedCommands.length * 50),
    tests: clamp(100 - input.diff.deletedAssertions * 25 - input.diff.addedSkips * 50 - (input.diff.testFilesTouched === 0 ? 20 : 0)),
    scope: clamp(100 - Math.max(0, changedFiles - 4) * 8 - Math.max(0, changedLines - 200) / 10),
    architecture: clamp(100 - input.diff.configFilesTouched.length * 10 - (changedFiles > 12 ? 25 : 0)),
    risk: clamp(100 - input.diff.dependencyFilesTouched.length * 20 - input.diff.ciFilesTouched.length * 20),
    maintainability: clamp(100 - (changedLines > 500 ? 25 : 0) - (changedFiles > 10 ? 20 : 0)),
    total: 0,
  };
  scores.total = clamp(
    scores.correctness * 0.3 +
      scores.tests * 0.2 +
      scores.scope * 0.15 +
      scores.architecture * 0.15 +
      scores.risk * 0.1 +
      scores.maintainability * 0.1,
  );

  let verdict: Verdict = "MERGE";
  if (
    (input.config.rubric.hardGates.failOnVerificationFailure && failedCommands.length > 0) ||
    (input.config.rubric.hardGates.failOnDeletedTests && input.diff.deletedAssertions > 0) ||
    input.diff.addedSkips > 0
  ) {
    verdict = "REJECT";
  } else if (
    findings.some((f) => f.severity === "high" || f.severity === "medium") ||
    scores.total < 85 ||
    (input.config.rubric.hardGates.requestChangesOnDependencyChange && input.diff.dependencyFilesTouched.length > 0)
  ) {
    verdict = "REQUEST_CHANGES";
  }

  const confidence = clamp(60 + findings.length * 5 + input.verification.length * 5) / 100;
  return { verdict, confidence, scores, findings };
}

