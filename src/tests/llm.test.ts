import { describe, expect, it } from "vitest";
import { parseLlmResponse, runLlmJudge } from "../core/llm.js";
import { defaultConfig } from "../core/config.js";

describe("parseLlmResponse", () => {
  it("parses well-formed JSON", () => {
    const result = parseLlmResponse(
      '{"findings":[{"severity":"high","category":"correctness","title":"t","detail":"d"}],"summary":"s"}',
    );
    expect(result.findings).toHaveLength(1);
    expect(result.summary).toBe("s");
  });

  it("extracts JSON embedded in prose", () => {
    const result = parseLlmResponse('Sure, here you go:\n{"findings":[],"summary":"clean"}\nThanks!');
    expect(result.findings).toEqual([]);
    expect(result.summary).toBe("clean");
  });

  it("drops findings with invalid severity or category", () => {
    const result = parseLlmResponse(
      '{"findings":[{"severity":"critical","category":"correctness","title":"t","detail":"d"}],"summary":""}',
    );
    expect(result.findings).toHaveLength(0);
  });
});

describe("runLlmJudge", () => {
  it("returns null when disabled", async () => {
    const result = await runLlmJudge({
      config: defaultConfig.llm,
      taskText: "task",
      diffText: "diff",
      verification: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when no API key is set", async () => {
    const result = await runLlmJudge({
      config: { ...defaultConfig.llm, enabled: true, apiKeyEnv: "MERGECODE_TEST_MISSING_KEY" },
      taskText: "task",
      diffText: "diff",
      verification: [],
    });
    expect(result).toBeNull();
  });
});
