import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JudgeRun } from "./types.js";

export function renderMarkdown(run: JudgeRun): string {
  const failed = run.verification.filter((v) => v.exitCode !== 0 || v.timedOut);
  const lines: string[] = [
    `# MergeCode Verdict: ${run.verdict}`,
    "",
    `Confidence: ${run.confidence.toFixed(2)}`,
    `Score: ${run.scores.total}/100`,
    "",
    ...(run.llmSummary ? ["## Maintainer AI Review", "", run.llmSummary, ""] : []),
    "## Review This First",
    "",
  ];

  if (run.findings.length === 0) {
    lines.push("- No major merge-worthiness findings detected.");
  } else {
    for (const finding of run.findings.slice(0, 6)) {
      lines.push(`- **${finding.severity.toUpperCase()} ${finding.category}: ${finding.title}**`);
      lines.push(`  ${finding.detail}${finding.file ? ` (${finding.file})` : ""}`);
    }
  }

  lines.push(
    "",
    "## Verification",
    "",
    failed.length === 0
      ? "- All configured verification commands passed."
      : `- ${failed.length} verification command(s) failed or timed out.`,
  );
  for (const v of run.verification) {
    lines.push(`- \`${v.command}\` -> ${v.timedOut ? "timeout" : v.exitCode} (${v.durationMs}ms)`);
  }

  lines.push(
    "",
    "## Diff Summary",
    "",
    `- Files changed: ${run.diff.files.length}`,
    `- Lines added: ${run.diff.totalAdded}`,
    `- Lines deleted: ${run.diff.totalDeleted}`,
    `- Test files touched: ${run.diff.testFilesTouched}`,
    `- Deleted assertions: ${run.diff.deletedAssertions}`,
    `- Added .skip/.only markers: ${run.diff.addedSkips}`,
  );

  if (run.diff.dependencyFilesTouched.length > 0) {
    lines.push(`- Dependency files: ${run.diff.dependencyFilesTouched.join(", ")}`);
  }
  if (run.diff.ciFilesTouched.length > 0) {
    lines.push(`- CI files: ${run.diff.ciFilesTouched.join(", ")}`);
  }

  lines.push("", "## Scores", "");
  for (const [key, value] of Object.entries(run.scores)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push("", "## Files", "");
  for (const file of run.diff.files) {
    lines.push(`- ${file.path} (+${file.added}/-${file.deleted}) [${file.category}]`);
  }

  return `${lines.join("\n")}\n`;
}

export function writeReport(repoPath: string, run: JudgeRun): string {
  const dir = join(repoPath, ".mergecode", "runs", run.id);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "report.md");
  writeFileSync(path, renderMarkdown(run), "utf8");
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  return path;
}
