import type { ReviewProviderResult } from "./types.js";

type UnknownRecord = Record<string, unknown>;

const ASU_AIML_RESPONSE_FORMAT_ERROR = "asu-aiml-response-format" as const;

type AsuAimlResponseFormatError = Error & {
  code: typeof ASU_AIML_RESPONSE_FORMAT_ERROR;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createAsuAimlResponseFormatError(): AsuAimlResponseFormatError {
  return Object.assign(new Error("Unexpected ASU AIML response format."), {
    code: ASU_AIML_RESPONSE_FORMAT_ERROR,
  });
}

/**
 * Identifies a safe parser failure for an otherwise successful provider response.
 * Request callers must not retry these errors or append untrusted response text to diagnostics.
 */
export function isAsuAimlResponseFormatError(error: Error): error is AsuAimlResponseFormatError {
  return "code" in error && error.code === ASU_AIML_RESPONSE_FORMAT_ERROR;
}

/**
 * Parses the supported ASU AIML response shapes into the provider result boundary.
 *
 * @param rawBody - Raw response body returned by the ASU AIML API.
 * @returns Normalized response text and optional token usage.
 * @throws When the body is not JSON or has no supported response text field.
 */
export function parseAsuAimlResponse(rawBody: string): ReviewProviderResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw createAsuAimlResponseFormatError();
  }

  if (!isRecord(parsed)) {
    throw createAsuAimlResponseFormatError();
  }

  const usageCandidate: UnknownRecord | undefined = isRecord(parsed.usage)
    ? parsed.usage
    : isRecord(parsed.metrics)
      ? parsed.metrics
      : undefined;
  const usage = usageCandidate
    ? {
        promptTokens: toFiniteNumber(usageCandidate.prompt_tokens ?? usageCandidate.input_tokens),
        completionTokens: toFiniteNumber(
          usageCandidate.completion_tokens ?? usageCandidate.output_tokens,
        ),
        totalTokens: toFiniteNumber(usageCandidate.total_tokens),
      }
    : undefined;
  const resultPrefix = { usage };

  if (typeof parsed.response === "string") return { output: parsed.response, ...resultPrefix };
  if (typeof parsed.output === "string") return { output: parsed.output, ...resultPrefix };
  if (typeof parsed.result === "string") return { output: parsed.result, ...resultPrefix };
  if (typeof parsed.content === "string") return { output: parsed.content, ...resultPrefix };

  if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
    const firstChoice = parsed.choices[0];
    if (
      isRecord(firstChoice) &&
      isRecord(firstChoice.message) &&
      typeof firstChoice.message.content === "string"
    ) {
      return { output: firstChoice.message.content, ...resultPrefix };
    }
  }

  if (isRecord(parsed.response)) {
    if (typeof parsed.response.content === "string")
      return { output: parsed.response.content, ...resultPrefix };
    if (typeof parsed.response.text === "string")
      return { output: parsed.response.text, ...resultPrefix };
    if (typeof parsed.response.message === "string")
      return { output: parsed.response.message, ...resultPrefix };
  }

  throw createAsuAimlResponseFormatError();
}
