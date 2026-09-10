#!/usr/bin/env node
import { Command } from "commander";
import { judge, printJudgeSummary } from "./commands/judge.js";

const program = new Command();

program
  .name("mergecode")
  .description("Maintainer-grade evaluation for AI-generated code.")
  .version("0.1.0");

program
  .command("judge")
  .description("Judge a candidate patch against a repo and task.")
  .requiredOption("--repo <path>", "Repository path")
  .requiredOption("--task <path>", "Task description path")
  .requiredOption("--patch <path>", "Patch file path")
  .option("--config <path>", "mergecode.yaml path")
  .option("--keep-workspace", "Keep temp workspace after judging")
  .option("--no-report", "Do not write .mergecode report files")
  .action(async (opts) => {
    try {
      const run = await judge(opts);
      printJudgeSummary(run);
      process.exitCode = run.verdict === "MERGE" ? 0 : run.verdict === "REQUEST_CHANGES" ? 1 : 2;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 2;
    }
  });

program.parse(process.argv);
