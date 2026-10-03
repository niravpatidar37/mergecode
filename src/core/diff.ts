import { readFileSync } from "node:fs";
import type { DiffSummary, FileChange } from "./types.js";

// Dependency manifests and lockfiles across the ecosystems MergeCode is likely to judge.
const DEPENDENCY_FILES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.toml",
  "Cargo.lock",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  "setup.py",
  "setup.cfg",
  "go.mod",
  "go.sum",
  "Gemfile",
  "Gemfile.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
]);

// Tooling / build configuration that changes how code is checked or built.
const CONFIG_FILES = new Set([
  "deny.toml",
  "rust-toolchain",
  "rust-toolchain.toml",
  "rustfmt.toml",
  ".rustfmt.toml",
  "clippy.toml",
  ".clippy.toml",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  "Makefile",
  "Dockerfile",
]);

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function classify(path: string): FileChange["category"] {
  const base = basename(path);
  if (DEPENDENCY_FILES.has(base) || /^requirements([-_.].*)?\.txt$/.test(base)) return "dependency";
  if (path.startsWith(".github/") || path.includes(".gitlab-ci") || path.startsWith(".circleci/")) return "ci";
  if (
    CONFIG_FILES.has(base) ||
    path.startsWith(".cargo/") ||
    /^tsconfig.*\.json$/.test(base) ||
    /\.config\.[cm]?[jt]s$/.test(base) ||
    /^\.(eslintrc|prettierrc|babelrc|swcrc)/.test(base)
  ) {
    return "config";
  }
  if (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    /^test_.*\.py$|_test\.py$/.test(base) ||
    /_test\.go$/.test(base) ||
    /(^|\/)(tests?|__tests__|spec)\//.test(path)
  ) {
    return "test";
  }
  if (/\.(md|mdx|txt|rst|adoc)$/.test(base)) return "docs";
  if (/\.([cm]?[jt]sx?|py|go|rs|java|kt|rb|cs|c|cc|cpp|h|hpp|swift|php)$/.test(base)) return "source";
  return "unknown";
}

// Assertion-like lines across JS/TS (vitest/jest), Python (assert/pytest/unittest),
// Rust (assert!/assert_eq!/prop_assert!...) and Go (testify).
const ASSERTION =
  /\b(expect|should|toBe|toEqual|assertEquals|assertTrue|assertFalse|assertRaises|require\.\w+|assert\.\w+)\b|\bassert\b(?!_)|\b(?:debug_|prop_)?assert(?:_eq|_ne|_matches)?!|\bpytest\.raises\b/;

// Markers that disable or narrow tests. Anchored to the start of the line so that
// mentions inside strings, comments or fixtures are not counted.
const SKIP =
  /^\s*(?:(?:describe|it|test)\.(?:skip|only|todo)\b|(?:xit|xdescribe|fit|fdescribe)\(|#\[ignore\b|@pytest\.mark\.(?:skip|skipif|xfail)\b|pytest\.(?:skip|xfail)\(|@unittest\.skip|t\.Skip(?:Now|f)?\()/;

// Rust unit tests live next to the code they test.
const RUST_INLINE_TEST = /#\[(?:[\w:]+::)?test\]|#\[cfg\(test\)\]|\bproptest!/;

interface FileState extends FileChange {
  hasInlineTests: boolean;
  addedInlineTests: boolean;
  candidateDeletedAssertions: number;
}

export function parseUnifiedDiff(raw: string): DiffSummary {
  const files = new Map<string, FileState>();
  let current: FileState | undefined;
  let inHunk = false;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const path = match?.[2] ?? "unknown";
      const category = classify(path);
      current = {
        path,
        added: 0,
        deleted: 0,
        isTest: category === "test",
        category,
        deletedAssertions: 0,
        addedSkips: 0,
        hasInlineTests: false,
        addedInlineTests: false,
        candidateDeletedAssertions: 0,
      };
      files.set(path, current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    // Header lines (---/+++, index, mode, rename) only appear before the first hunk.
    if (!inHunk) continue;

    const body = line.slice(1);
    if (current.path.endsWith(".rs") && RUST_INLINE_TEST.test(body)) current.hasInlineTests = true;

    if (line.startsWith("+")) {
      current.added++;
      // Only code can skip a test; docs that *mention* `.skip` or `#[ignore]` must not count.
      if ((current.category === "test" || current.category === "source") && SKIP.test(body)) current.addedSkips++;
      if (current.path.endsWith(".rs") && RUST_INLINE_TEST.test(body)) current.addedInlineTests = true;
    } else if (line.startsWith("-")) {
      current.deleted++;
      if (ASSERTION.test(body)) current.candidateDeletedAssertions++;
    }
  }

  const list: FileChange[] = [...files.values()].map((f) => {
    const testy = f.isTest || f.hasInlineTests;
    return {
      path: f.path,
      added: f.added,
      deleted: f.deleted,
      isTest: f.isTest,
      category: f.category,
      deletedAssertions: testy ? f.candidateDeletedAssertions : 0,
      addedSkips: f.addedSkips,
      touchesTests: f.isTest || f.addedInlineTests,
    };
  });

  return {
    files: list,
    totalAdded: list.reduce((sum, f) => sum + f.added, 0),
    totalDeleted: list.reduce((sum, f) => sum + f.deleted, 0),
    testFilesTouched: list.filter((f) => f.touchesTests).length,
    dependencyFilesTouched: list.filter((f) => f.category === "dependency").map((f) => f.path),
    configFilesTouched: list.filter((f) => f.category === "config").map((f) => f.path),
    ciFilesTouched: list.filter((f) => f.category === "ci").map((f) => f.path),
    deletedAssertions: list.reduce((sum, f) => sum + f.deletedAssertions, 0),
    addedSkips: list.reduce((sum, f) => sum + f.addedSkips, 0),
  };
}

export function parseDiffFile(path: string): DiffSummary {
  return parseUnifiedDiff(readFileSync(path, "utf8"));
}
