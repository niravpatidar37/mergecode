import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfig, loadConfig } from "../core/config.js";

function withConfig(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "mergecode-config-"));
  writeFileSync(join(dir, "mergecode.yaml"), text, "utf8");
  return dir;
}

describe("loadConfig", () => {
  it("returns defaults when no file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "mergecode-config-"));
    expect(loadConfig(dir)).toEqual(defaultConfig);
  });

  it("returns defaults for an empty file", () => {
    expect(loadConfig(withConfig(""))).toEqual(defaultConfig);
  });

  it("merges partial config over defaults", () => {
    const config = loadConfig(withConfig("verify:\n  commands: [npm test]\n  timeoutMs: 5000\n"));
    expect(config.verify).toEqual({ commands: ["npm test"], timeoutMs: 5000 });
    expect(config.llm).toEqual(defaultConfig.llm);
  });

  it("rejects non-list verify commands", () => {
    expect(() => loadConfig(withConfig("verify:\n  commands: npm test\n"))).toThrow(/verify\.commands/);
  });

  it("rejects non-positive timeouts", () => {
    expect(() => loadConfig(withConfig("verify:\n  timeoutMs: -1\n"))).toThrow(/verify\.timeoutMs/);
  });

  it("rejects wrongly typed booleans", () => {
    expect(() => loadConfig(withConfig("llm:\n  enabled: 'yes'\n"))).toThrow(/llm\.enabled/);
  });

  it("rejects an explicit config path that does not exist", () => {
    expect(() => loadConfig(tmpdir(), join(tmpdir(), "does-not-exist-mergecode.yaml"))).toThrow(/not found/);
  });
});
