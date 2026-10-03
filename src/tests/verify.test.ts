import { afterEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { runVerification, scrubEnv } from "../core/verify.js";

const cwd = tmpdir();

describe("scrubEnv", () => {
  it("removes secret-looking variables and the configured extra names", () => {
    const env = scrubEnv(
      {
        PATH: "/bin",
        HOME: "/home/x",
        GITHUB_TOKEN: "t",
        ACTIONS_RUNTIME_TOKEN: "t",
        ACTIONS_ID_TOKEN_REQUEST_URL: "u",
        NPM_TOKEN: "t",
        AWS_SECRET_ACCESS_KEY: "s",
        DB_PASSWORD: "p",
        MY_CUSTOM_LLM: "k",
        CARGO_TERM_COLOR: "always",
        GITHUB_OUTPUT: "/runner/_temp/out",
        GITHUB_ENV: "/runner/_temp/env",
        GITHUB_PATH: "/runner/_temp/path",
        GITHUB_STEP_SUMMARY: "/runner/_temp/summary",
        ACTIONS_RESULTS_URL: "https://x",
        GITHUB_SHA: "abc",
        DATABASE_URL: "postgres://u:p@h/db",
        SENTRY_DSN: "https://k@sentry",
        GH_PAT: "ghp_x",
      },
      ["MY_CUSTOM_LLM"],
    );
    expect(Object.keys(env).sort()).toEqual(["CARGO_TERM_COLOR", "GITHUB_SHA", "HOME", "PATH"]);
  });
});

describe("runVerification", () => {
  afterEach(() => {
    delete process.env.MERGECODE_TEST_SECRET_TOKEN;
    delete process.env.MERGECODE_TEST_PLAIN;
  });

  it("does not leak secrets into verification commands", async () => {
    process.env.MERGECODE_TEST_SECRET_TOKEN = "s3cr3t";
    process.env.MERGECODE_TEST_PLAIN = "visible";
    const [result] = await runVerification(
      cwd,
      [`node -e "console.log(process.env.MERGECODE_TEST_SECRET_TOKEN || 'absent', process.env.MERGECODE_TEST_PLAIN)"`],
      30_000,
    );
    expect(result?.exitCode).toBe(0);
    expect(result?.stdoutHead.trim()).toBe("absent visible");
  });

  it("caps captured output", async () => {
    const [result] = await runVerification(cwd, [`node -e "process.stdout.write('x'.repeat(2000000))"`], 30_000);
    expect(result?.exitCode).toBe(0);
    expect(result?.stdoutHead.length).toBe(4096);
  });

  it("kills the whole process tree on timeout", async () => {
    const started = Date.now();
    const [result] = await runVerification(cwd, [`node -e "setTimeout(() => {}, 60000)"`], 1_000);
    expect(result?.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);

  it("reports non-zero exit codes", async () => {
    const [result] = await runVerification(cwd, [`node -e "process.exit(3)"`], 30_000);
    expect(result?.exitCode).toBe(3);
    expect(result?.timedOut).toBe(false);
  });

  it.skipIf(process.platform === "win32")("kills background processes a command leaves behind", async () => {
    const [result] = await runVerification(
      cwd,
      [
        `node -e "const c=require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)'],{stdio:'ignore'});c.unref();console.log(c.pid)"`,
      ],
      30_000,
    );
    const pid = Number(result?.stdoutHead.trim());
    expect(pid).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
