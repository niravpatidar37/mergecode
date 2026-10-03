import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../core/workspace.js";

describe("createWorkspace", () => {
  it("excludes build output only at the repo root, but VCS/dependency dirs at any depth", () => {
    const repo = mkdtempSync(join(tmpdir(), "mergecode-wsrepo-"));
    const files = ["src/dist/keep.ts", "pkg/target/keep.go", "dist/drop.js", "target/drop.rlib", "node_modules/x/drop.js", "pkg/node_modules/y/drop.js", "src/a.ts"];
    for (const f of files) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), "x");
    }
    const ws = createWorkspace(repo);
    try {
      const has = (f: string) => existsSync(join(ws.path, f));
      expect(has("src/a.ts")).toBe(true);
      expect(has("src/dist/keep.ts")).toBe(true);
      expect(has("pkg/target/keep.go")).toBe(true);
      expect(has("dist/drop.js")).toBe(false);
      expect(has("target/drop.rlib")).toBe(false);
      expect(has("node_modules/x/drop.js")).toBe(false);
      expect(has("pkg/node_modules/y/drop.js")).toBe(false);
    } finally {
      ws.cleanup();
    }
  });
});
