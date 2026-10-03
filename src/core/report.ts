import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JudgeRun } from "./types.js";

/** GitHub rejects comments over 65,536 characters; leave headroom for the sticky marker. */
export const MAX_REPORT_CHARS = 60_000;
const MAX_FIELD = 1000;
const MAX_FILES_LISTED = 200;

/**
 * Renders untrusted text (file paths from the diff, LLM output, PR-derived strings)
 * as inert inline Markdown: one line, no HTML, no links/images, no @mentions,
 * no headings. Reports are posted as PR comments, so this is an output-handling
 * boundary (OWASP LLM05).
 */
export function inert(text: string, max = MAX_FIELD): string {
  const oneLine = text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim();
  const clipped = oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
  return clipped
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_\[\]#~]/g, (c) => `\\${c}`)
    .replace(/@/g, "@\u200b")
    .replace(/:\/\//g, ":\u200b//");
}

export function renderMarkdown(run: JudgeRun): string {
  const failed = run.verification.filter((v) => v.exitCode !== 0 || v.timedOut);
  const lines: string[] = [
    `# MergeCode Verdict: ${run.verdict}`,
    "",
    `Confidence: ${run.confidence.toFixed(2)}`,
    `Score: ${run.scores.total}/100`,
    "",
    ...(run.llmSummary ? ["## Maintainer AI Review", "", `> ${inert(run.llmSummary, 2000)}`, ""] : []),
    "## Review This First",
    "",
  ];

  if (run.findings.length === 0) {
    lines.push("- No major merge-worthiness findings detected.");
  } else {
    for (const finding of run.findings.slice(0, 8)) {
      lines.push(`- **${finding.severity.toUpperCase()} ${finding.category}: ${inert(finding.title, 200)}**`);
      lines.push(`  ${inert(finding.detail)}${finding.file ? ` (\`${finding.file.replace(/[`\r\n]/g, "")}\`)` : ""}`);
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
    lines.push(`- ${inert(v.command, 200)} -> ${v.timedOut ? "timeout" : v.exitCode} (${v.durationMs}ms)`);
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
    `- Added skip/only markers: ${run.diff.addedSkips}`,
  );

  if (run.diff.dependencyFilesTouched.length > 0) {
    lines.push(`- Dependency files: ${run.diff.dependencyFilesTouched.map((p) => inert(p, 200)).join(", ")}`);
  }
  if (run.diff.ciFilesTouched.length > 0) {
    lines.push(`- CI files: ${run.diff.ciFilesTouched.map((p) => inert(p, 200)).join(", ")}`);
  }

  lines.push("", "## Scores", "");
  for (const [key, value] of Object.entries(run.scores)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push("", "## Files", "");
  for (const file of run.diff.files.slice(0, MAX_FILES_LISTED)) {
    lines.push(`- ${inert(file.path, 300)} (+${file.added}/-${file.deleted}) [${file.category}]`);
  }
  if (run.diff.files.length > MAX_FILES_LISTED) {
    lines.push(`- … ${run.diff.files.length - MAX_FILES_LISTED} more file(s) truncated`);
  }

  let md = `${lines.join("\n")}\n`;
  if (md.length > MAX_REPORT_CHARS) {
    const note = "\n\n_Report truncated to fit GitHub's comment size limit._\n";
    md = md.slice(0, MAX_REPORT_CHARS - note.length) + note;
  }
  return md;
}

/** Writes report.md and run.json into `dir` (default: <repo>/.mergecode/runs/<id>). */
export function writeReport(repoPath: string, run: JudgeRun, dir?: string): string {
  const outDir = dir ?? join(repoPath, ".mergecode", "runs", run.id);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "report.md");
  writeFileSync(path, renderMarkdown(run), "utf8");
  writeFileSync(join(outDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  return path;
}
