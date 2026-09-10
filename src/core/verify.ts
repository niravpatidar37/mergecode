import { spawn } from "node:child_process";
import type { VerificationResult } from "./types.js";

const OUTPUT_CAP = 4096;

function head(bufs: Buffer[]): string {
  return Buffer.concat(bufs).subarray(0, OUTPUT_CAP).toString("utf8");
}

export async function runVerification(
  cwd: string,
  commands: string[],
  timeoutMs: number,
): Promise<VerificationResult[]> {
  const out: VerificationResult[] = [];
  for (const command of commands) {
    out.push(await runOne(cwd, command, timeoutMs));
  }
  return out;
}

async function runOne(cwd: string, command: string, timeoutMs: number): Promise<VerificationResult> {
  const start = Date.now();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);

  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);

  return {
    command,
    exitCode: result.code,
    signal: result.signal ?? undefined,
    durationMs: Date.now() - start,
    stdoutHead: head(stdout),
    stderrHead: head(stderr),
    timedOut,
  };
}

