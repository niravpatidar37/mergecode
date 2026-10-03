import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

// Build output, caches and VCS metadata: never needed to judge a patch and often huge.
const EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".mergecode",
  "dist",
  "coverage",
  "target",
  ".venv",
  "__pycache__",
  ".pytest_cache",
]);

export interface Workspace {
  path: string;
  cleanup: () => void;
}

export function createWorkspace(repoPath: string, keep = false): Workspace {
  const base = mkdtempSync(join(tmpdir(), "mergecode-ws-"));
  const cleanup = () => {
    if (!keep && existsSync(base)) rmSync(base, { recursive: true, force: true });
  };
  const target = join(base, basename(repoPath) || "repo");
  try {
    cpSync(repoPath, target, {
      recursive: true,
      // Symlinks are copied as links, never followed, so a link in the repo cannot
      // pull files from outside it into the workspace.
      verbatimSymlinks: true,
      filter: (src) => {
        const rel = relative(repoPath, src);
        // Only exclude by path *inside* the repo, so a repo that itself lives under
        // e.g. /home/me/dist/ is still copied.
        return !rel.split(sep).some((part) => EXCLUDES.has(part));
      },
    });
  } catch (err) {
    cleanup();
    throw err;
  }
  return { path: target, cleanup };
}

export function applyPatch(workspacePath: string, patchPath: string): { ok: boolean; error?: string } {
  try {
    execFileSync("git", ["init", "-q"], { cwd: workspacePath, stdio: "ignore" });
    // --unsafe-paths is deliberately NOT passed: git refuses patches that write outside
    // the workspace or through symlinks.
    execFileSync("git", ["apply", "--whitespace=nowarn", patchPath], {
      cwd: workspacePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    return { ok: false, error: (stderr || (err instanceof Error ? err.message : String(err))).trim().slice(0, 2000) };
  }
}
