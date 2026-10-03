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

const RUNNABLE_EXT = /\.([cm]?[jt]sx?|py|go|rs|java|kt|rb|cs|swift|php)$/;

/** A test file that a test runner would actually execute (not fixtures or snapshots). */
function isRunnableTest(path: string): boolean {
  return classify(path) === "test" && RUNNABLE_EXT.test(basename(path));
}

// Assertion-like lines, per language, so e.g. Rust's Result::expect(...) or the word
// "should" in a comment is not mistaken for an assertion.
const ASSERTION_BY_LANG: [RegExp, RegExp][] = [
  [/\.[cm]?[jt]sx?$/, /\b(?:expect|assert(?:\.\w+)?)\s*\(|\.should\b|\.(?:toBe|toEqual|toStrictEqual|toThrow|toMatch|toContain|toHaveBeenCalled)\w*\s*\(/],
  [/\.py$/, /^\s*assert\b|\bself\.assert[A-Z]\w*\s*\(|\bassert[A-Z]\w*\s*\(|\bpytest\.raises\b/],
  [/\.rs$/, /\b(?:debug_|prop_)?assert(?:_eq|_ne|_matches)?!\s*[([{]/],
  [/\.go$/, /\b(?:assert|require)\.\w+\s*\(|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(/],
];
const ASSERTION_FALLBACK = /\bassert\w*\b|\bexpect\s*\(/;

function assertionPattern(path: string): RegExp {
  return ASSERTION_BY_LANG.find(([ext]) => ext.test(path))?.[1] ?? ASSERTION_FALLBACK;
}

// Markers that disable or narrow tests. Anchored to the start of the line so that
// mentions inside strings, comments or fixtures are not counted; Jasmine-style
// xit/fit/... must look like a test declaration (string title first), so an ordinary
// `fit(model, data)` call is not a "focused test".
const SKIP =
  /^\s*(?:(?:describe|it|test)\.(?:skip|only|todo)\b|(?:xit|xdescribe|fit|fdescribe)\(\s*['"`]|#\[ignore\b|@pytest\.mark\.(?:skip|skipif|xfail)\b|pytest\.(?:skip|xfail)\(|@unittest\.skip|t\.Skip(?:Now|f)?\()/;

// Rust unit tests live next to the code they test.
const RUST_INLINE_TEST = /#\[(?:[\w:]+::)?test\]|#\[cfg\(test\)\]|\bproptest!|\bmod tests\b/;

/** Decodes git's C-style quoted paths ("a/d\303\251ploy.yml") to UTF-8. */
export function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"') || raw.length < 2) return raw;
  const bytes: number[] = [];
  const s = raw.slice(1, -1);
  const simple: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, "\\": 92 };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = s[i + 1] ?? "";
    if (/[0-7]/.test(next)) {
      const oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)![0];
      bytes.push(parseInt(oct, 8));
      i += oct.length;
    } else {
      bytes.push(simple[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** Strips the a/ or b/ prefix from a (possibly quoted) header path; null for /dev/null. */
function headerPath(raw: string): string | null {
  const p = unquoteGitPath(raw.trim());
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

/** Best-effort split of the `diff --git` line; exact paths come from later headers. */
function gitLinePaths(rest: string): { a: string; b: string } {
  const quoted = rest.match(/^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/);
  if (quoted && (rest.startsWith('"') || rest.endsWith('"'))) {
    return { a: headerPath(quoted[1]!) ?? "", b: headerPath(quoted[2]!) ?? "" };
  }
  const plain = rest.match(/^a\/(.+?) b\/(.+)$/);
  return { a: plain?.[1] ?? "unknown", b: plain?.[2] ?? "unknown" };
}

interface FileState {
  oldPath: string;
  newPath: string;
  deletedFile: boolean;
  added: number;
  deleted: number;
  addedSkips: number;
  hasInlineTests: boolean;
  addedInlineTests: boolean;
  candidateDeletedAssertions: number;
}

export function parseUnifiedDiff(raw: string): DiffSummary {
  const states: FileState[] = [];
  let current: FileState | undefined;
  let inHunk = false;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("diff --git ")) {
      const { a, b } = gitLinePaths(line.slice("diff --git ".length));
      current = {
        oldPath: a,
        newPath: b,
        deletedFile: false,
        added: 0,
        deleted: 0,
        addedSkips: 0,
        hasInlineTests: false,
        addedInlineTests: false,
        candidateDeletedAssertions: 0,
      };
      states.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;

    if (!inHunk) {
      // Extended headers: these give exact, unambiguous paths.
      if (line.startsWith("rename from ") || line.startsWith("copy from ")) {
        current.oldPath = unquoteGitPath(line.replace(/^(rename|copy) from /, ""));
      } else if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
        current.newPath = unquoteGitPath(line.replace(/^(rename|copy) to /, ""));
      } else if (line.startsWith("deleted file mode")) {
        current.deletedFile = true;
      } else if (line.startsWith("--- ")) {
        const p = headerPath(line.slice(4));
        if (p !== null) current.oldPath = p;
      } else if (line.startsWith("+++ ")) {
        const p = headerPath(line.slice(4));
        if (p === null) current.deletedFile = true;
        else current.newPath = p;
      }
    }

    if (line.startsWith("@@")) {
      inHunk = true;
      // The text after the second @@ is the enclosing function/module (e.g. "mod tests {").
      const context = line.replace(/^@@[^@]*@@/, "");
      if (current.newPath.endsWith(".rs") && RUST_INLINE_TEST.test(context)) current.hasInlineTests = true;
      continue;
    }
    if (!inHunk) continue;

    const path = current.deletedFile ? current.oldPath : current.newPath;
    const category = classify(path);
    const body = line.slice(1);
    if (path.endsWith(".rs") && RUST_INLINE_TEST.test(body)) current.hasInlineTests = true;

    if (line.startsWith("+")) {
      current.added++;
      // Only code can skip a test; docs that *mention* `.skip` or `#[ignore]` must not count.
      if ((category === "test" || category === "source") && SKIP.test(body)) current.addedSkips++;
      if (path.endsWith(".rs") && RUST_INLINE_TEST.test(body)) current.addedInlineTests = true;
    } else if (line.startsWith("-")) {
      current.deleted++;
      if (assertionPattern(path).test(body)) current.candidateDeletedAssertions++;
    }
  }

  const list: FileChange[] = [];
  const removedTestFiles: string[] = [];
  const touched = { dependency: new Set<string>(), config: new Set<string>(), ci: new Set<string>() };

  for (const f of states) {
    const path = f.deletedFile ? f.oldPath : f.newPath;
    const category = classify(path);
    const isTest = category === "test";
    for (const p of new Set([f.oldPath, f.newPath])) {
      const c = classify(p);
      if (c === "dependency" || c === "config" || c === "ci") touched[c].add(p);
    }
    if (isRunnableTest(f.oldPath) && (f.deletedFile || !isRunnableTest(f.newPath))) removedTestFiles.push(f.oldPath);
    list.push({
      path,
      ...(f.oldPath !== f.newPath && !f.deletedFile ? { oldPath: f.oldPath } : {}),
      added: f.added,
      deleted: f.deleted,
      isTest,
      category,
      deletedAssertions: isTest || f.hasInlineTests ? f.candidateDeletedAssertions : 0,
      addedSkips: f.addedSkips,
      touchesTests: isTest || f.addedInlineTests,
    });
  }

  return {
    files: list,
    totalAdded: list.reduce((sum, f) => sum + f.added, 0),
    totalDeleted: list.reduce((sum, f) => sum + f.deleted, 0),
    testFilesTouched: list.filter((f) => f.touchesTests).length,
    dependencyFilesTouched: [...touched.dependency],
    configFilesTouched: [...touched.config],
    ciFilesTouched: [...touched.ci],
    deletedAssertions: list.reduce((sum, f) => sum + f.deletedAssertions, 0),
    addedSkips: list.reduce((sum, f) => sum + f.addedSkips, 0),
    removedTestFiles,
  };
}

export function parseDiffFile(path: string): DiffSummary {
  return parseUnifiedDiff(readFileSync(path, "utf8"));
}
