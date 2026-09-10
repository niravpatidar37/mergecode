#!/usr/bin/env node
import { parseArgs } from "node:util";
import { judge, printJudgeSummary } from "./commands/judge.js";

const USAGE =
  "Usage: mergecode judge --repo <path> --task <path> --patch <path> [--config <path>] [--keep-workspace] [--no-report]";

const [command, ...rest] = process.argv.slice(2);

if (command !== "judge") {
  console.error(USAGE);
  process.exit(command ? 2 : 0);
}

const { values } = parseArgs({
  args: rest,
  options: {
    repo: { type: "string" },
    task: { type: "string" },
    patch: { type: "string" },
    config: { type: "string" },
    "keep-workspace": { type: "boolean", default: false },
    "no-report": { type: "boolean", default: false },
  },
} as const);

if (!values.repo || !values.task || !values.patch) {
  console.error(`Missing required option(s).\n${USAGE}`);
  process.exit(2);
}

try {
  const run = await judge({
    repo: values.repo,
    task: values.task,
    patch: values.patch,
    config: values.config,
    keepWorkspace: values["keep-workspace"],
    noReport: values["no-report"],
  });
  printJudgeSummary(run);
  process.exitCode = run.verdict === "MERGE" ? 0 : run.verdict === "REQUEST_CHANGES" ? 1 : 2;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 2;
}
