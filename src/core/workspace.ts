import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

// VCS metadata, installed dependencies and caches: excluded at any depth.
const EXCLUDE_ANYWHERE = new Set([".git", "node_modules", ".venv", "__pycache__", ".pytest_cache"]);
// Build output: excluded only at the repo root, so source dirs such as src/dist/ or
// pkg/target/ are still copied (otherwise a patch touching them could not apply).
const EXCLUDE_AT_ROOT = new Set([".mergecode", "dist", "coverage", "target"]);

/** Node 20's cpSync passes Win32 namespaced paths (\\?\C:\...) to the filter; normalise them. */
function stripWin32Namespace(p: string): string {
  if (p.startsWith("\\\\?\\UNC\\")) return `\\\\${p.slice(8)}`;
  if (p.startsWith("\\\\?\\")) return p.slice(4);
  return p;
}

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
      // Symlinks are copied as links rather than followed, so the copy itself never
      // reads outside the repo. Absolute links still point outside the workspace.
      verbatimSymlinks: true,
      filter: (src) => {
        // Judge by the path *inside* the repo, so a repo that itself lives under
        // e.g. /home/me/dist/ is still copied.
        const rel = relative(stripWin32Namespace(repoPath), stripWin32Namespace(src));
        // Fail loudly rather than silently copying something we cannot place in the repo.
        if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Unexpected path outside the repo: ${src}`);
        const parts = rel.split(sep);
        if (parts[0] !== undefined && EXCLUDE_AT_ROOT.has(parts[0])) return false;
        return !parts.some((part) => EXCLUDE_ANYWHERE.has(part));
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
