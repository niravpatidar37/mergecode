import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const EXCLUDES = new Set([".git", "node_modules", ".mergecode", "dist", "coverage"]);

export interface Workspace {
  path: string;
  cleanup: () => void;
}

export function createWorkspace(repoPath: string, keep = false): Workspace {
  const base = mkdtempSync(join(tmpdir(), "mergecode-"));
  const target = join(base, basename(repoPath) || "repo");
  cpSync(repoPath, target, {
    recursive: true,
    filter: (src) => !src.split("/").some((part) => EXCLUDES.has(part)),
  });
  return {
    path: target,
    cleanup: () => {
      if (!keep && existsSync(base)) rmSync(base, { recursive: true, force: true });
    },
  };
}

export function applyPatch(workspacePath: string, patchPath: string): { ok: boolean; error?: string } {
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspacePath, stdio: "ignore" });
    execFileSync("git", ["apply", "--whitespace=nowarn", patchPath], {
      cwd: workspacePath,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

