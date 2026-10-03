import { spawn, spawnSync } from "node:child_process";
import type { VerificationResult } from "./types.js";

const OUTPUT_CAP = 4096;
/** Grace period between SIGTERM and SIGKILL, and the backstop if 'close' never fires. */
const KILL_GRACE_MS = 3_000;

// Verification commands run code from the candidate patch, which is untrusted by
// design. They must never inherit credentials from the judging process.
const SECRET_NAME =
  /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|CREDENTIAL|PRIVATE|API_?KEY|ACCESS_?KEY|AUTH|COOKIE|SESSION|DSN|DATABASE_URL|CONNECTION_STRING|_PAT$|_KEY$|^KEY$)/i;

// GitHub Actions file commands: a verification command that can write to these could
// set step outputs (e.g. forge the verdict) or inject env vars into later steps.
const RUNNER_CONTROL = /^(GITHUB_(OUTPUT|ENV|PATH|STATE|STEP_SUMMARY)|ACTIONS_[A-Z_]+)$/i;

export function scrubEnv(env: NodeJS.ProcessEnv, extraNames: string[] = []): NodeJS.ProcessEnv {
  const extra = new Set(extraNames.map((n) => n.toUpperCase()));
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SECRET_NAME.test(name) || RUNNER_CONTROL.test(name) || extra.has(name.toUpperCase())) continue;
    out[name] = value;
  }
  return out;
}

/** Keeps only the first `cap` bytes so a chatty or hostile command cannot exhaust memory. */
class HeadBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  constructor(private readonly cap: number) {}
  push(chunk: Buffer): void {
    if (this.size >= this.cap) return;
    const slice = chunk.subarray(0, this.cap - this.size);
    this.chunks.push(slice);
    this.size += slice.length;
  }
  toString(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export async function runVerification(
  cwd: string,
  commands: string[],
  timeoutMs: number,
  extraSecretEnv: string[] = [],
): Promise<VerificationResult[]> {
  const env = scrubEnv(process.env, extraSecretEnv);
  const out: VerificationResult[] = [];
  for (const command of commands) {
    out.push(await runOne(cwd, command, timeoutMs, env));
  }
  return out;
}

function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") {
      // The shell (cmd.exe) is the direct child; its descendants keep our pipes open.
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      // detached: true made the child a process-group leader; signal the whole group.
      process.kill(-pid, signal);
    }
  } catch {
    // Already exited.
  }
}

async function runOne(
  cwd: string,
  command: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<VerificationResult> {
  const start = Date.now();
  const stdout = new HeadBuffer(OUTPUT_CAP);
  const stderr = new HeadBuffer(OUTPUT_CAP);
  // shell: true is intentional: commands come from the maintainer's config, not the patch.
  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let timedOut = false;
  let backstop: NodeJS.Timeout | undefined;

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    let settled = false;
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      resolve({ code, signal });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid, "SIGTERM");
      backstop = setTimeout(() => {
        killTree(child.pid, "SIGKILL");
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null, "SIGKILL");
      }, KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      stderr.push(Buffer.from(String(err)));
      clearTimeout(timer);
      finish(null, null);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      // Background processes a command left in its process group must not outlive it.
      if (process.platform !== "win32") killTree(child.pid, "SIGKILL");
      finish(code, signal);
    });
  });
  if (backstop) clearTimeout(backstop);

  return {
    command,
    exitCode: result.code,
    signal: result.signal ?? undefined,
    durationMs: Date.now() - start,
    stdoutHead: stdout.toString(),
    stderrHead: stderr.toString(),
    timedOut,
  };
}
