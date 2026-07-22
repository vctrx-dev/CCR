import type {
  AsuAimlProviderConfig,
  ReviewProvider,
  ReviewProviderMessage,
  ReviewProviderResult,
} from "./types.js";

/**
 * Default model provider identifier sent in query requests.
 */
export const DEFAULT_ASU_MODEL_PROVIDER = "openai";

const DEFAULT_ASU_BASE_URL = "https://api-main.aiml.asu.edu/queryV2";
const DEFAULT_ASU_TEMPERATURE = 0.2;
const DEFAULT_ASU_TIMEOUT_MS = 120000;
const DEFAULT_INPUT_COST_PER_1M_USD = 5;
const DEFAULT_OUTPUT_COST_PER_1M_USD = 15;

/**
 * Parses a float from an environment variable string, returning the fallback when unset.
 *
 * @param value - Raw env value (may be undefined).
 * @param fallback - Default to use when value is empty.
 * @returns Parsed number or fallback.
 */
function readNumberEnv(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a numeric value for environment variable, received "${value}".`);
  }

  return parsed;
}

/**
 * Parses a positive integer from an environment variable string.
 *
 * @param value - Raw env value (may be undefined).
 * @param fallback - Default to use when value is empty.
 * @returns Parsed positive integer or fallback.
 */
function readIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer for environment variable, received "${value}".`);
  }

  return parsed;
}

/**
 * Trims and normalizes an optional string, returning undefined for blank values.
 *
 * @param value - Raw optional string.
 * @returns Trimmed string or undefined.
 */
function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

/**
 * Validates and returns a trimmed non-empty string.
 *
 * @param value - String to validate.
 * @param label - Human-readable label for error messages.
 * @returns Trimmed value.
 */
function assertNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return trimmed;
}

/**
 * Builds a validated ASU AIML provider config from user-provided input.
 *
 * @param input - Partial or full input values for the provider configuration.
 * @returns A fully resolved configuration with defaults applied.
 */
export function createAsuAimlProviderConfig(input: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  modelProvider?: string;
  temperature?: number;
  timeoutMs?: number;
}): AsuAimlProviderConfig {
  return {
    apiKey: assertNonEmpty(input.apiKey, "apiKey"),
    baseUrl: input.baseUrl?.trim() || DEFAULT_ASU_BASE_URL,
    modelProvider: normalizeOptionalString(input.modelProvider) ?? DEFAULT_ASU_MODEL_PROVIDER,
    model: assertNonEmpty(input.model, "model"),
    temperature: input.temperature ?? DEFAULT_ASU_TEMPERATURE,
    timeoutMs: input.timeoutMs ?? DEFAULT_ASU_TIMEOUT_MS,
  };
}

/**
 * Reads ASU AIML provider configuration from environment variables.
 *
 * Expects `ASU_API_KEY` and `ASU_MODEL` to be set.
 * Supports optional `ASU_BASE_URL`, `ASU_MODEL_PROVIDER`, `ASU_TEMPERATURE`, and `ASU_TIMEOUT_MS`.
 *
 * @param env - Process environment object (defaults to `process.env`).
 * @returns A fully resolved configuration with defaults applied.
 */
export function readAsuAimlProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): AsuAimlProviderConfig {
  const apiKey = env.ASU_API_KEY?.trim();
  const model = env.ASU_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error("ASU_API_KEY and ASU_MODEL are required when using the ASU provider.");
  }

  return createAsuAimlProviderConfig({
    apiKey,
    baseUrl: env.ASU_BASE_URL,
    modelProvider: normalizeOptionalString(env.ASU_MODEL_PROVIDER) ?? DEFAULT_ASU_MODEL_PROVIDER,
    model,
    temperature: readNumberEnv(env.ASU_TEMPERATURE, DEFAULT_ASU_TEMPERATURE),
    timeoutMs: readIntegerEnv(env.ASU_TIMEOUT_MS, DEFAULT_ASU_TIMEOUT_MS),
  });
}

type UnknownRecord = Record<string, unknown>;

/**
 * Type guard: checks whether a value is a non-null, non-array object.
 *
 * @param value - Value to check.
 * @returns True if value is a record.
 */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts a finite number from an unknown value.
 *
 * @param value - Value to coerce.
 * @returns Finite number or undefined.
 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

/**
 * Converts provider messages to ASU AIML system prompt + query format.
 * Extracts system messages into a combined system prompt and uses the last user message as the query.
 *
 * @param messages - Provider messages to convert.
 * @returns System prompt and query string.
 */
function convertMessagesToAsuFormat(messages: ReviewProviderMessage[]): {
  systemPrompt: string;
  query: string;
} {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);

  const userMessages = messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];

  if (!lastUserMessage) {
    throw new Error("No user message found in provider input.");
  }

  return {
    systemPrompt: systemParts.join("\n\n"),
    query: lastUserMessage.content,
  };
}

/**
 * Parses the ASU AIML API response JSON into a standard ReviewProviderResult.
 * Handles multiple response field name conventions: response, output, result, content,
 * OpenAI-style choices array, and nested response object.
 *
 * @param rawBody - Raw response body string.
 * @returns Parsed result with output and optional usage.
 */
function parseAsuAimlResponse(rawBody: string): ReviewProviderResult {
  const parsed: unknown = JSON.parse(rawBody);

  if (!isRecord(parsed)) {
    throw new Error(`Unexpected ASU AIML response format: ${rawBody.slice(0, 500)}`);
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

  throw new Error(`Unexpected ASU AIML response format: ${rawBody.slice(0, 500)}`);
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Calculates retry delay with exponential backoff, respecting Retry-After header.
 *
 * @param attempt - Zero-based attempt number.
 * @param response - Optional HTTP response for Retry-After header.
 * @returns Delay in milliseconds.
 */
function getRetryDelayMs(attempt: number, response?: Response): number {
  if (response?.headers) {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const parsed = Number.parseInt(retryAfter, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed * 1000;
      }
    }
  }

  return RETRY_BASE_DELAY_MS * 2 ** attempt;
}

/**
 * Returns a promise that resolves after the given delay.
 *
 * @param milliseconds - Delay in milliseconds.
 */
function waitForDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

type RequestError = Error & {
  retryable?: boolean;
};

/**
 * Type guard: checks whether an error has a retryable property.
 *
 * @param error - Error to check.
 * @returns True if error has retryable property.
 */
function isRequestError(error: Error): error is RequestError {
  return "retryable" in error;
}

/**
 * Checks whether the response body indicates a persistent rate limit that should not be retried.
 *
 * @param rawBody - Response body string.
 * @returns True if the body indicates a persistent rate limit.
 */
function isPersistentRateLimitBody(rawBody: string): boolean {
  return /rate limit/i.test(rawBody) || /project has exceeded/i.test(rawBody);
}

/**
 * Creates an error marked with retryability information.
 *
 * @param message - Error message.
 * @param retryable - Whether the request can be retried.
 * @returns Error with retryable metadata.
 */
function createRequestError(message: string, retryable: boolean): RequestError {
  return Object.assign(new Error(message), { retryable });
}

/**
 * Estimates token count from text (rough heuristic: 1 token ≈ 4 characters).
 *
 * @param value - Text to estimate.
 * @returns Estimated token count.
 */
function estimateTokensFromText(value: string): number {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

/**
 * Estimates the USD cost of a request based on token usage.
 * Uses environment variable overrides or sensible defaults ($5/1M input, $15/1M output).
 *
 * @param promptTokens - Number of input tokens.
 * @param completionTokens - Number of output tokens.
 * @returns Estimated cost in USD (rounded to 6 decimal places).
 */
export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const inputRate = Number(
    process.env.CCR_EST_INPUT_COST_PER_1M_USD ?? DEFAULT_INPUT_COST_PER_1M_USD,
  );
  const outputRate = Number(
    process.env.CCR_EST_OUTPUT_COST_PER_1M_USD ?? DEFAULT_OUTPUT_COST_PER_1M_USD,
  );
  return Number(
    ((promptTokens / 1_000_000) * inputRate + (completionTokens / 1_000_000) * outputRate).toFixed(
      6,
    ),
  );
}

/**
 * Sends a chat completion request to the ASU AIML API with retry logic.
 *
 * Retries on retryable HTTP status codes (429, 5xx) with exponential backoff,
 * but fails fast on persistent rate-limit bodies.
 *
 * @param config - Fully resolved ASU AIML provider configuration.
 * @param messages - Conversation messages to send.
 * @returns The parsed response result.
 */
export async function requestAsuAimlChatCompletion(
  config: AsuAimlProviderConfig,
  messages: ReviewProviderMessage[],
): Promise<ReviewProviderResult> {
  const { systemPrompt, query } = convertMessagesToAsuFormat(messages);

  const body: Record<string, unknown> = {
    action: "query",
    request_source: "override_params",
    query,
    model_name: config.model,
    model_params: {
      temperature: config.temperature,
      ...(systemPrompt.length > 0 ? { system_prompt: systemPrompt } : {}),
    },
  };

  if (config.modelProvider.trim().length > 0) {
    body.model_provider = config.modelProvider;
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const rawBody = await response.text();

      if (!response.ok) {
        const requestError = createRequestError(
          `ASU AIML request failed with status ${response.status}: ${rawBody}`,
          !isPersistentRateLimitBody(rawBody),
        );

        if (
          RETRYABLE_STATUS_CODES.has(response.status) &&
          requestError.retryable !== false &&
          attempt < MAX_RETRY_ATTEMPTS - 1
        ) {
          const delayMs = getRetryDelayMs(attempt, response);
          await waitForDelay(delayMs);
          continue;
        }

        throw requestError;
      }

      return parseAsuAimlResponse(rawBody);
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (isAbort) {
        throw new Error(`ASU AIML request timed out after ${config.timeoutMs}ms.`);
      }

      if (error instanceof Error && isRequestError(error) && error.retryable === false) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delayMs = getRetryDelayMs(attempt);
        await waitForDelay(delayMs);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `ASU AIML request failed after ${MAX_RETRY_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
}

/**
 * Creates a ReviewProvider backed by the ASU AIML API.
 *
 * @param config - Fully resolved ASU AIML provider configuration.
 * @returns A provider whose `review` method sends messages to the ASU API.
 */
export function createAsuAimlProvider(config: AsuAimlProviderConfig): ReviewProvider {
  return {
    async review(input) {
      try {
        return await requestAsuAimlChatCompletion(config, input.messages);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to complete the review request: ${message}`);
      }
    },
  };
}
