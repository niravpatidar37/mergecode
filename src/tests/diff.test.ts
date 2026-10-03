import { describe, expect, it } from "vitest";
import { classify, parseUnifiedDiff } from "../core/diff.js";

function fileDiff(path: string, body: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${body}\n`;
}

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

  it("handles CRLF diffs", () => {
    const summary = parseUnifiedDiff(fileDiff("src/a.ts", "-old\n+new").replace(/\n/g, "\r\n"));
    expect(summary.files[0]?.path).toBe("src/a.ts");
    expect(summary.totalAdded).toBe(1);
  });

  it("detects Rust assertion removals and #[ignore] in test files", () => {
    const summary = parseUnifiedDiff(
      fileDiff("tests/lock.rs", "-    assert_eq!(a, b);\n-    prop_assert!(ok);\n+#[ignore]\n+fn later() {}"),
    );
    expect(summary.testFilesTouched).toBe(1);
    expect(summary.deletedAssertions).toBe(2);
    expect(summary.addedSkips).toBe(1);
  });

  it("detects pytest skips and assertion removals", () => {
    const summary = parseUnifiedDiff(
      fileDiff("e2e/test_attacks.py", "-    assert resp.denied\n+@pytest.mark.skip(reason='flaky')\n+    pytest.skip('x')"),
    );
    expect(summary.testFilesTouched).toBe(1);
    expect(summary.deletedAssertions).toBe(1);
    expect(summary.addedSkips).toBe(2);
  });

  it("counts Rust inline #[test] additions as test changes", () => {
    const summary = parseUnifiedDiff(
      fileDiff("src/lock.rs", "-fn a() {}\n+fn a() { 1 }\n+#[test]\n+fn a_works() { assert_eq!(a(), 1); }"),
    );
    expect(summary.files[0]?.category).toBe("source");
    expect(summary.testFilesTouched).toBe(1);
  });

  it("counts deleted assertions in Rust inline test modules", () => {
    const summary = parseUnifiedDiff(
      fileDiff("src/lock.rs", " #[cfg(test)]\n mod tests {\n-    assert!(verify(x));\n+    let _ = verify(x);"),
    );
    expect(summary.deletedAssertions).toBe(1);
  });

  it("ignores assertion-like text in ordinary source files", () => {
    const summary = parseUnifiedDiff(fileDiff("src/app.ts", "-  // expect this to be fast\n+  // fast"));
    expect(summary.deletedAssertions).toBe(0);
  });

  it("does not count skip markers mentioned in docs or config", () => {
    const summary = parseUnifiedDiff(
      fileDiff("README.md", "+| Skipped tests: `.skip`, `#[ignore]`, `@pytest.mark.skip`, `t.Skip()` |") +
        fileDiff("docs/guide.txt", "+Use it.skip(...) sparingly") +
        fileDiff(".github/workflows/ci.yml", "+  # test.only is banned"),
    );
    expect(summary.addedSkips).toBe(0);
  });

  it("still counts skip markers in Rust inline tests in source files", () => {
    const summary = parseUnifiedDiff(fileDiff("src/lock.rs", "+    #[ignore]\n+    #[test]\n+    fn flaky() {}"));
    expect(summary.addedSkips).toBe(1);
  });
});

describe("classify", () => {
  it.each([
    ["Cargo.toml", "dependency"],
    ["Cargo.lock", "dependency"],
    ["crates/x/Cargo.toml", "dependency"],
    ["yarn.lock", "dependency"],
    ["pnpm-lock.yaml", "dependency"],
    ["bun.lockb", "dependency"],
    ["package-lock.json", "dependency"],
    ["e2e/pyproject.toml", "dependency"],
    ["e2e/uv.lock", "dependency"],
    ["requirements-dev.txt", "dependency"],
    ["go.sum", "dependency"],
    [".github/workflows/ci.yml", "ci"],
    [".github/dependabot.yml", "ci"],
    ["tsconfig.json", "config"],
    ["vitest.config.ts", "config"],
    ["deny.toml", "config"],
    ["rust-toolchain.toml", "config"],
    [".cargo/config.toml", "config"],
    ["src/core/config.ts", "source"],
    ["src/config.rs", "source"],
    ["tests/lock.rs", "test"],
    ["src/tests/diff.test.ts", "test"],
    ["e2e/test_attacks.py", "test"],
    ["pkg/auth_test.go", "test"],
    ["README.md", "docs"],
    ["assets/logo.svg", "unknown"],
  ])("%s -> %s", (path, expected) => {
    expect(classify(path)).toBe(expected);
  });
});
