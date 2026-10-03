import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { judge } from "../commands/judge.js";

/** Builds a throwaway repo plus a patch that changes a.txt from "hello" to "world". */
function fixture(config: object): { repo: string; task: string; patch: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "mergecode-judge-"));
  const repo = join(root, "repo");
  execFileSync("git", ["init", "-q", repo]);
  writeFileSync(join(repo, "a.txt"), "hello\n");
  // YAML is a superset of JSON.
  writeFileSync(join(repo, "mergecode.yaml"), JSON.stringify(config));
  const patch = join(root, "pr.diff");
  writeFileSync(
    patch,
    "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-hello\n+world\n",
  );
  const task = join(root, "task.md");
  writeFileSync(task, "Say world instead of hello.\n");
  return { repo, task, patch, out: join(root, "out") };
}

const checkPatched = `node -e "process.exit(require('fs').readFileSync('a.txt','utf8').trim()==='world'?0:1)"`;

describe("judge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MERGECODE_TEST_KEY;
  });

  it("applies the patch in an isolated copy, verifies it, and leaves the repo untouched", async () => {
    const f = fixture({ verify: { commands: [checkPatched] } });
    const run = await judge({ repo: f.repo, task: f.task, patch: f.patch, outDir: f.out });
    expect(run.verification[0]?.exitCode).toBe(0);
    expect(run.verdict).toBe("MERGE");
    expect(readFileSync(join(f.repo, "a.txt"), "utf8")).toBe("hello\n");
    expect(existsSync(join(f.out, "report.md"))).toBe(true);
    expect(existsSync(join(f.out, "run.json"))).toBe(true);
  });

  it("rejects a patch that does not apply", async () => {
    const f = fixture({});
    writeFileSync(join(f.repo, "a.txt"), "something else\n");
    const run = await judge({ repo: f.repo, task: f.task, patch: f.patch, noReport: true });
    expect(run.verdict).toBe("REJECT");
    expect(run.findings[0]?.title).toBe("Patch did not apply");
  });

  it("degrades gracefully when the LLM pass fails", async () => {
    process.env.MERGECODE_TEST_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const f = fixture({ llm: { enabled: true, apiKeyEnv: "MERGECODE_TEST_KEY" } });
    const run = await judge({ repo: f.repo, task: f.task, patch: f.patch, noReport: true });
    expect(run.verdict).toBe("MERGE");
    expect(run.findings.some((x) => x.title === "LLM review unavailable" && x.severity === "low")).toBe(true);
  });

  it("cleans up its temp workspace", async () => {
    const before = new Set(readdirSync(tmpdir()).filter((d) => d.startsWith("mergecode-ws-")));
    const f = fixture({});
    await judge({ repo: f.repo, task: f.task, patch: f.patch, noReport: true });
    const after = readdirSync(tmpdir()).filter((d) => d.startsWith("mergecode-ws-") && !before.has(d));
    expect(after).toEqual([]);
  });
});
