import { describe, expect, it } from "vitest";
import { parseAsuAimlResponse } from "../../../src/llm/asu-api-response";

describe("parseAsuAimlResponse", () => {
  it("should normalize a direct response and token usage", () => {
    expect(
      parseAsuAimlResponse(
        JSON.stringify({
          response: "review output",
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
      ),
    ).toEqual({
      output: "review output",
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
  });

  it("should support nested response and choices shapes", () => {
    expect(parseAsuAimlResponse(JSON.stringify({ response: { text: "nested" } })).output).toBe(
      "nested",
    );
    expect(
      parseAsuAimlResponse(JSON.stringify({ choices: [{ message: { content: "choice" } }] }))
        .output,
    ).toBe("choice");
  });

  it("should reject responses without supported output text", () => {
    expect(() => parseAsuAimlResponse(JSON.stringify({ status: "ok" }))).toThrow(
      "Unexpected ASU AIML response format",
    );
  });
});
