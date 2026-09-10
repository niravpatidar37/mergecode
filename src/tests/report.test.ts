import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../core/report.js";
import type { JudgeRun } from "../core/types.js";

describe("renderMarkdown", () => {
  it("renders a 30-second verdict summary", () => {
    const run: JudgeRun = {
      id: "run_test",
      repoPath: "/repo",
      taskPath: "/task.md",
      patchPath: "/patch.diff",
      startedAt: "now",
      completedAt: "later",
      verification: [],
      diff: {
        files: [],
        totalAdded: 0,
        totalDeleted: 0,
        testFilesTouched: 0,
        dependencyFilesTouched: [],
        configFilesTouched: [],
        ciFilesTouched: [],
        deletedAssertions: 0,
        addedSkips: 0,
      },
      findings: [],
      scores: { correctness: 100, tests: 100, scope: 100, architecture: 100, risk: 100, maintainability: 100, total: 100 },
      verdict: "MERGE",
      confidence: 0.7,
    };
    const md = renderMarkdown(run);
    expect(md).toContain("# MergeCode Verdict: MERGE");
    expect(md).toContain("## Review This First");
    expect(md).toContain("## Diff Summary");
  });
});

