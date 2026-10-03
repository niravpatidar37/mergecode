#!/usr/bin/env node
import { parseArgs } from "node:util";
import { judge, printJudgeSummary } from "./commands/judge.js";

const USAGE = `Usage: mergecode judge --repo <path> --task <path> --patch <path> [options]

Options:
  --config <path>     Config file (default: <repo>/mergecode.yaml)
  --out <dir>         Write report.md and run.json to <dir>
  --keep-workspace    Keep the temporary workspace for debugging
  --no-report         Do not write report files

Exit codes: 0 MERGE, 1 REQUEST_CHANGES, 2 REJECT, 3 error`;

const [command, ...rest] = process.argv.slice(2);

if (command === "--help" || command === "-h" || command === undefined) {
  console.log(USAGE);
  process.exit(0);
}
if (command !== "judge") {
  console.error(USAGE);
  process.exit(3);
}

let values: {
  repo?: string;
  task?: string;
  patch?: string;
  config?: string;
  out?: string;
  "keep-workspace"?: boolean;
  "no-report"?: boolean;
};
try {
  ({ values } = parseArgs({
    args: rest,
    options: {
      repo: { type: "string" },
      task: { type: "string" },
      patch: { type: "string" },
      config: { type: "string" },
      out: { type: "string" },
      "keep-workspace": { type: "boolean", default: false },
      "no-report": { type: "boolean", default: false },
    },
  }));
} catch (err) {
  console.error(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
  process.exit(3);
}

if (!values.repo || !values.task || !values.patch) {
  console.error(`Missing required option(s).\n\n${USAGE}`);
  process.exit(3);
}

try {
  const run = await judge({
    repo: values.repo,
    task: values.task,
    patch: values.patch,
    config: values.config,
    outDir: values.out,
    keepWorkspace: values["keep-workspace"],
    noReport: values["no-report"],
  });
  printJudgeSummary(run);
  process.exitCode = run.verdict === "MERGE" ? 0 : run.verdict === "REQUEST_CHANGES" ? 1 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 3;
}
