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

export function loadConfig(repoPath: string, explicitPath?: string): MergeCodeConfig {
  const path = explicitPath ?? join(repoPath, "mergecode.yaml");
  if (!existsSync(path)) return defaultConfig;
  const parsed = YAML.parse(readFileSync(path, "utf8")) as Partial<MergeCodeConfig>;
  return {
    version: 1,
    verify: {
      commands: parsed.verify?.commands ?? [],
      timeoutMs: parsed.verify?.timeoutMs ?? defaultConfig.verify.timeoutMs,
    },
    rubric: {
      hardGates: {
        failOnVerificationFailure:
          parsed.rubric?.hardGates?.failOnVerificationFailure ??
          defaultConfig.rubric.hardGates.failOnVerificationFailure,
        failOnDeletedTests:
          parsed.rubric?.hardGates?.failOnDeletedTests ??
          defaultConfig.rubric.hardGates.failOnDeletedTests,
        requestChangesOnDependencyChange:
          parsed.rubric?.hardGates?.requestChangesOnDependencyChange ??
          defaultConfig.rubric.hardGates.requestChangesOnDependencyChange,
      },
    },
    llm: {
      enabled: parsed.llm?.enabled ?? defaultConfig.llm.enabled,
      model: parsed.llm?.model ?? defaultConfig.llm.model,
      apiKeyEnv: parsed.llm?.apiKeyEnv ?? defaultConfig.llm.apiKeyEnv,
      maxDiffChars: parsed.llm?.maxDiffChars ?? defaultConfig.llm.maxDiffChars,
    },
  };
}

