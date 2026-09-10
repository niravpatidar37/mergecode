import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../core/diff.js";

describe("parseUnifiedDiff", () => {
  it("summarizes touched files and deleted assertions", () => {
    const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,2 +1,3 @@
-old
+new
+extra
diff --git a/src/auth.test.ts b/src/auth.test.ts
--- a/src/auth.test.ts
+++ b/src/auth.test.ts
@@ -1,2 +1,2 @@
-expect(login()).toBe(false)
+test.skip("later", () => {})
`;
    const summary = parseUnifiedDiff(diff);
    expect(summary.files).toHaveLength(2);
    expect(summary.totalAdded).toBe(3);
    expect(summary.totalDeleted).toBe(2);
    expect(summary.testFilesTouched).toBe(1);
    expect(summary.deletedAssertions).toBe(1);
    expect(summary.addedSkips).toBe(1);
  });

  it("classifies dependency and CI files", () => {
    const diff = `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-{}
+{"dependencies":{}}
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1 +1 @@
-old
+new
`;
    const summary = parseUnifiedDiff(diff);
    expect(summary.dependencyFilesTouched).toEqual(["package.json"]);
    expect(summary.ciFilesTouched).toEqual([".github/workflows/ci.yml"]);
  });
});

