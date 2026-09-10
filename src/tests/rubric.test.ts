import { describe, expect, it } from "vitest";
import { defaultConfig } from "../core/config.js";
import { evaluatePatch } from "../core/rubric.js";
import type { DiffSummary } from "../core/types.js";

const cleanDiff: DiffSummary = {
  files: [{ path: "src/auth.ts", added: 2, deleted: 1, isTest: false, category: "source", deletedAssertions: 0, addedSkips: 0 },
    { path: "src/auth.test.ts", added: 4, deleted: 0, isTest: true, category: "test", deletedAssertions: 0, addedSkips: 0 }],
  totalAdded: 6,
  totalDeleted: 1,
  testFilesTouched: 1,
  dependencyFilesTouched: [],
  configFilesTouched: [],
  ciFilesTouched: [],
  deletedAssertions: 0,
  addedSkips: 0,
};

describe("evaluatePatch", () => {
  it("merges clean focused patches", () => {
    const result = evaluatePatch({ config: defaultConfig, diff: cleanDiff, verification: [{ command: "npm test", exitCode: 0, durationMs: 1, stdoutHead: "", stderrHead: "", timedOut: false }] });
    expect(result.verdict).toBe("MERGE");
  });

  it("rejects failed verification", () => {
    const result = evaluatePatch({ config: defaultConfig, diff: cleanDiff, verification: [{ command: "npm test", exitCode: 1, durationMs: 1, stdoutHead: "", stderrHead: "fail", timedOut: false }] });
    expect(result.verdict).toBe("REJECT");
    expect(result.findings.some((f) => f.title === "Verification failed")).toBe(true);
  });

  it("requests changes for source changes without tests", () => {
    const diff = { ...cleanDiff, files: cleanDiff.files.slice(0, 1), testFilesTouched: 0 };
    const result = evaluatePatch({ config: defaultConfig, diff, verification: [] });
    expect(result.verdict).toBe("REQUEST_CHANGES");
  });
});

