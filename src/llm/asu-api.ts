import { parseAsuAimlResponse } from "./asu-api-response.js";
import type {
  AsuAimlProviderConfig,
  ReviewProvider,
  ReviewProviderMessage,
  ReviewProviderResult,
} from "./types.js";

export {
  createAsuAimlProviderConfig,
  DEFAULT_ASU_MODEL_PROVIDER,
  estimateCostUsd,
  readAsuAimlProviderConfig,
} from "./asu-api-config.js";

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
