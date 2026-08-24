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

  it.each(["not json", JSON.stringify({ error: "provider-echoed-secret" })])(
    "does not include malformed provider content in format errors",
    (rawBody) => {
      let error: unknown;

      try {
        parseAsuAimlResponse(rawBody);
      } catch (reason) {
        error = reason;
      }

      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) {
        throw new Error("Expected an Error from the response parser.");
      }

      expect(error.message).toBe("Unexpected ASU AIML response format.");
      expect(error.message).not.toContain(rawBody);
      expect(error.message).not.toContain("provider-echoed-secret");
    },
  );
});
