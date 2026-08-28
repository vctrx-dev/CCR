import { describe, expect, it } from "vitest";
import {
  AsuAimlResponseBodyLimitError,
  readAsuAimlErrorResponseBody,
  readAsuAimlSuccessfulResponseBody,
} from "../../../src/llm/asu-api-response-body";

describe("ASU AIML response body boundary", () => {
  it("should retain a complete successful response body below the byte ceiling", async () => {
    const response = new Response('{"response":"completed"}', { status: 200 });

    await expect(readAsuAimlSuccessfulResponseBody(response)).resolves.toBe(
      '{"response":"completed"}',
    );
  });

  it("should reject a declared oversized successful body before reading its content", async () => {
    const response = new Response("not retained", {
      headers: { "Content-Length": "1048577" },
      status: 200,
    });

    await expect(readAsuAimlSuccessfulResponseBody(response)).rejects.toBeInstanceOf(
      AsuAimlResponseBodyLimitError,
    );
  });

  it("should retain only the bounded prefix needed for error classification", async () => {
    const body = "x".repeat(5_000);

    await expect(
      readAsuAimlErrorResponseBody(new Response(body, { status: 503 })),
    ).resolves.toHaveLength(4_096);
  });
});
