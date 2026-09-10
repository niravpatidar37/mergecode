import { readFileSync } from "node:fs";
import type { DiffSummary, FileChange } from "./types.js";

function classify(path: string): FileChange["category"] {
  const base = path.split("/").pop() ?? path;
  if (/^(package|pnpm|yarn|bun)-lock\./.test(base) || base === "package.json") return "dependency";
  if (path.startsWith(".github/workflows/") || path.includes(".gitlab-ci") || path.includes(".circleci")) return "ci";
  if (/(\.config\.|config\.|tsconfig|vite\.config|webpack\.config|eslint|prettier)/i.test(path)) return "config";
  if (/\.(test|spec)\.[jt]sx?$/.test(path) || path.includes("__tests__") || path.includes("/tests/")) return "test";
  if (/\.(md|mdx|txt|rst)$/.test(path)) return "docs";
  if (/\.[jt]sx?$|\.py$|\.go$|\.rs$|\.java$|\.rb$/.test(path)) return "source";
  return "unknown";
}

function isAssertion(line: string): boolean {
  return /\b(expect|assert|should|toBe|toEqual|assertEquals|assertTrue)\b/.test(line);
}

function isSkip(line: string): boolean {
  return /\b(describe|it|test)\.skip\b|\.only\b/.test(line);
}

export function parseUnifiedDiff(raw: string): DiffSummary {
  const files = new Map<string, FileChange>();
  let current: FileChange | undefined;

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const path = match?.[2] ?? "unknown";
      current = {
        path,
        added: 0,
        deleted: 0,
        isTest: classify(path) === "test",
        category: classify(path),
        deletedAssertions: 0,
        addedSkips: 0,
      };
      files.set(path, current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      current.added++;
      if (isSkip(line)) current.addedSkips++;
    } else if (line.startsWith("-")) {
      current.deleted++;
      if (current.isTest && isAssertion(line)) current.deletedAssertions++;
    }
  }

  const list = [...files.values()];
  return {
    files: list,
    totalAdded: list.reduce((sum, f) => sum + f.added, 0),
    totalDeleted: list.reduce((sum, f) => sum + f.deleted, 0),
    testFilesTouched: list.filter((f) => f.isTest).length,
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

