import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { MergeCodeConfig } from "./types.js";

export const defaultConfig: MergeCodeConfig = {
  version: 1,
  verify: {
    commands: [],
    timeoutMs: 120_000,
  },
  rubric: {
    hardGates: {
      failOnVerificationFailure: true,
      failOnDeletedTests: false,
      requestChangesOnDependencyChange: true,
    },
  },
  llm: {
    enabled: false,
    model: "claude-sonnet-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    maxDiffChars: 12_000,
  },
};

class ConfigError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid MergeCode config (${path}): ${message}`);
  }
}

type Obj = Record<string, unknown>;

/** Largest delay setTimeout supports; larger values fire after ~1ms. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Misspelled keys would otherwise be silently ignored and defaults applied. */
function onlyKeys(obj: Obj, allowed: string[], path: string, where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      const at = where ? `${where}.${key}` : key;
      throw new ConfigError(path, `unknown key "${at}" (allowed: ${allowed.join(", ")})`);
    }
  }
}

function section(parent: Obj, key: string, path: string, where: string): Obj {
  const value = parent[key];
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new ConfigError(path, `${where} must be a mapping`);
  return value as Obj;
}

function bool(obj: Obj, key: string, fallback: boolean, path: string, where: string): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ConfigError(path, `${where}.${key} must be true or false`);
  return value;
}

function str(obj: Obj, key: string, fallback: string, path: string, where: string): string {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(path, `${where}.${key} must be a non-empty string`);
  }
  return value;
}

function posInt(obj: Obj, key: string, fallback: number, path: string, where: string, max: number): number {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > max) {
    throw new ConfigError(path, `${where}.${key} must be a positive integer no greater than ${max}`);
  }
  return value;
}

export function loadConfig(repoPath: string, explicitPath?: string): MergeCodeConfig {
  const path = explicitPath ?? join(repoPath, "mergecode.yaml");
  if (!existsSync(path)) {
    if (explicitPath) throw new Error(`MergeCode config not found: ${explicitPath}`);
    return defaultConfig;
  }
  const parsed: unknown = YAML.parse(readFileSync(path, "utf8"));
  if (parsed === null || parsed === undefined) return defaultConfig;
  if (typeof parsed !== "object" || Array.isArray(parsed)) throw new ConfigError(path, "top level must be a mapping");
  const root = parsed as Obj;
  // `report` is accepted for compatibility with the documented example config.
  onlyKeys(root, ["version", "verify", "rubric", "llm", "report"], path, "");

  const verify = section(root, "verify", path, "verify");
  const commands = verify.commands ?? [];
  if (!Array.isArray(commands) || !commands.every((c) => typeof c === "string" && c.trim() !== "")) {
    throw new ConfigError(path, "verify.commands must be a list of non-empty strings");
  }

  const rubric = section(root, "rubric", path, "rubric");
  const gates = section(rubric, "hardGates", path, "rubric.hardGates");
  const llm = section(root, "llm", path, "llm");
  onlyKeys(verify, ["commands", "timeoutMs"], path, "verify");
  onlyKeys(rubric, ["hardGates"], path, "rubric");
  onlyKeys(gates, ["failOnVerificationFailure", "failOnDeletedTests", "requestChangesOnDependencyChange"], path, "rubric.hardGates");
  onlyKeys(llm, ["enabled", "model", "apiKeyEnv", "maxDiffChars"], path, "llm");
  const d = defaultConfig;
  const g = "rubric.hardGates";

  return {
    version: 1,
    verify: {
      commands: commands as string[],
      timeoutMs: posInt(verify, "timeoutMs", d.verify.timeoutMs, path, "verify", MAX_TIMEOUT_MS),
    },
    rubric: {
      hardGates: {
        failOnVerificationFailure: bool(gates, "failOnVerificationFailure", d.rubric.hardGates.failOnVerificationFailure, path, g),
        failOnDeletedTests: bool(gates, "failOnDeletedTests", d.rubric.hardGates.failOnDeletedTests, path, g),
        requestChangesOnDependencyChange: bool(
          gates,
          "requestChangesOnDependencyChange",
          d.rubric.hardGates.requestChangesOnDependencyChange,
          path,
          g,
        ),
      },
    },
    llm: {
      enabled: bool(llm, "enabled", d.llm.enabled, path, "llm"),
      model: str(llm, "model", d.llm.model, path, "llm"),
      apiKeyEnv: str(llm, "apiKeyEnv", d.llm.apiKeyEnv, path, "llm"),
      maxDiffChars: posInt(llm, "maxDiffChars", d.llm.maxDiffChars, path, "llm", 1_000_000),
    },
  };
}
