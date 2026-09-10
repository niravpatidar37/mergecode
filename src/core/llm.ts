import type { Finding, MergeCodeConfig, VerificationResult } from "./types.js";

export interface LlmJudgement {
  findings: Finding[];
  summary: string;
}

const ALLOWED_SEVERITY = new Set(["low", "medium", "high"]);
const ALLOWED_CATEGORY = new Set(["correctness", "tests", "scope", "architecture", "risk", "maintainability"]);

export function parseLlmResponse(text: string): LlmJudgement {
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : text) as { findings?: Finding[]; summary?: string };
  const findings = (parsed.findings ?? [])
    .filter((f) => ALLOWED_SEVERITY.has(f.severity) && ALLOWED_CATEGORY.has(f.category) && typeof f.title === "string")
    .slice(0, 5);
  return { findings, summary: typeof parsed.summary === "string" ? parsed.summary : "" };
}

export async function runLlmJudge(input: {
  config: MergeCodeConfig["llm"];
  taskText: string;
  diffText: string;
  verification: VerificationResult[];
}): Promise<LlmJudgement | null> {
  const apiKey = process.env[input.config.apiKeyEnv];
  if (!input.config.enabled || !apiKey) return null;

  const verificationSummary =
    input.verification.map((v) => `${v.command} -> ${v.timedOut ? "timeout" : v.exitCode}`).join("\n") ||
    "(no verification commands configured)";

  const prompt = `You are a senior maintainer reviewing a patch for merge-worthiness.

Task:
${input.taskText}

Verification results:
${verificationSummary}

Unified diff (may be truncated):
${input.diffText.slice(0, input.config.maxDiffChars)}

Reply with strict JSON only, no prose, matching this shape:
{"findings": [{"severity": "low"|"medium"|"high", "category": "correctness"|"tests"|"scope"|"architecture"|"risk"|"maintainability", "title": string, "detail": string}], "summary": string}
Surface issues a human reviewer would raise that automated checks would miss: design fit, misleading naming, missed edge cases, subtle behavior changes. Keep findings under 5. If the patch looks solid, return an empty findings array.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM judge request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "{}";
  return parseLlmResponse(text);
}
