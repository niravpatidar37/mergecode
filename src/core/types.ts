export type Verdict = "MERGE" | "REQUEST_CHANGES" | "REJECT";
export type Severity = "low" | "medium" | "high";
export type FindingCategory =
  | "correctness"
  | "tests"
  | "scope"
  | "architecture"
  | "risk"
  | "maintainability";

export interface MergeCodeConfig {
  version: 1;
  verify: {
    commands: string[];
    timeoutMs: number;
  };
  rubric: {
    hardGates: {
      failOnVerificationFailure: boolean;
      failOnDeletedTests: boolean;
      requestChangesOnDependencyChange: boolean;
    };
  };
}

export interface VerificationResult {
  command: string;
  exitCode: number | null;
  signal?: string;
  durationMs: number;
  stdoutHead: string;
  stderrHead: string;
  timedOut: boolean;
}

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  isTest: boolean;
  category: "source" | "test" | "dependency" | "config" | "ci" | "docs" | "unknown";
  deletedAssertions: number;
  addedSkips: number;
}

export interface DiffSummary {
  files: FileChange[];
  totalAdded: number;
  totalDeleted: number;
  testFilesTouched: number;
  dependencyFilesTouched: string[];
  configFilesTouched: string[];
  ciFilesTouched: string[];
  deletedAssertions: number;
  addedSkips: number;
}

export interface Finding {
  severity: Severity;
  category: FindingCategory;
  title: string;
  detail: string;
  file?: string;
  evidence?: string;
}

export interface ScoreBreakdown {
  correctness: number;
  tests: number;
  scope: number;
  architecture: number;
  risk: number;
  maintainability: number;
  total: number;
}

export interface JudgeRun {
  id: string;
  repoPath: string;
  taskPath: string;
  patchPath: string;
  startedAt: string;
  completedAt: string;
  verification: VerificationResult[];
  diff: DiffSummary;
  findings: Finding[];
  scores: ScoreBreakdown;
  verdict: Verdict;
  confidence: number;
  reportPath?: string;
}
