import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { parseDiffFile } from "../core/diff.js";
import { evaluatePatch } from "../core/rubric.js";
import { applyPatch, createWorkspace } from "../core/workspace.js";
import { runVerification } from "../core/verify.js";
import { runLlmJudge } from "../core/llm.js";
import { renderMarkdown, writeReport } from "../core/report.js";
import type { Finding, JudgeRun, Verdict } from "../core/types.js";

export interface JudgeOptions {
  repo: string;
  task: string;
  patch: string;
  config?: string;
  keepWorkspace?: boolean;
  noReport?: boolean;
  /** Write report.md / run.json here instead of <repo>/.mergecode/runs/<id>. */
  outDir?: string;
}

export async function judge(opts: JudgeOptions): Promise<JudgeRun> {
  const repoPath = resolve(opts.repo);
  const taskPath = resolve(opts.task);
  const patchPath = resolve(opts.patch);
  const config = loadConfig(repoPath, opts.config ? resolve(opts.config) : undefined);
  const taskText = readFileSync(taskPath, "utf8");
  const diffText = readFileSync(patchPath, "utf8");
  const diff = parseDiffFile(patchPath);
  const startedAt = new Date().toISOString();

  const workspace = createWorkspace(repoPath, opts.keepWorkspace);
  try {
    const apply = applyPatch(workspace.path, patchPath);
    const applyFindings: Finding[] = apply.ok
      ? []
      : [
          {
            severity: "high",
            category: "correctness",
            title: "Patch did not apply",
            detail: apply.error ?? "git apply failed.",
          },
        ];
    const verification = apply.ok
      ? await runVerification(workspace.path, config.verify.commands, config.verify.timeoutMs, [config.llm.apiKeyEnv])
      : [];
    const evaluation = evaluatePatch({ config, diff, verification });
    let findings = [...applyFindings, ...evaluation.findings];
    let verdict: Verdict = apply.ok ? evaluation.verdict : "REJECT";
    let llmSummary: string | undefined;

    if (apply.ok && config.llm.enabled) {
      try {
        const llm = await runLlmJudge({ config: config.llm, taskText, diffText, verification });
        if (llm) {
          findings = [...findings, ...llm.findings];
          llmSummary = llm.summary || undefined;
          // The model may only make the verdict stricter, never more lenient.
          if (verdict === "MERGE" && llm.findings.some((f) => f.severity === "high" || f.severity === "medium")) {
            verdict = "REQUEST_CHANGES";
          }
        }
      } catch (err) {
        // The rule-based verdict stands on its own; an LLM outage must not fail the run.
        findings.push({
          severity: "low",
          category: "risk",
          title: "LLM review unavailable",
          detail: `The optional LLM pass failed and was skipped: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const run: JudgeRun = {
      id: `run_${randomUUID().slice(0, 8)}`,
      repoPath,
      taskPath,
      patchPath,
      startedAt,
      completedAt: new Date().toISOString(),
      verification,
      diff,
      findings,
      scores: apply.ok ? evaluation.scores : { ...evaluation.scores, correctness: 0, total: 0 },
      verdict,
      confidence: apply.ok ? evaluation.confidence : 0.95,
      llmSummary,
    };
    if (!opts.noReport) run.reportPath = writeReport(repoPath, run, opts.outDir ? resolve(opts.outDir) : undefined);
    return run;
  } finally {
    workspace.cleanup();
  }
}

export function printJudgeSummary(run: JudgeRun): void {
  console.log(renderMarkdown(run));
  if (run.reportPath) console.log(`Report: ${run.reportPath}`);
}
