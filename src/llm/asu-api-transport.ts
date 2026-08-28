import {
  AsuAimlResponseBodyLimitError,
  readAsuAimlErrorResponseBody,
  readAsuAimlSuccessfulResponseBody,
} from "./asu-api-response-body.js";
import { isAsuAimlResponseFormatError, parseAsuAimlResponse } from "./asu-api-response.js";
import type { AsuAimlProviderConfig, ReviewProviderResult } from "./types.js";

/**
 * ASU AIML request transport. Keep retry and upstream-response handling here so provider adapters
 * can build requests without duplicating secret-safe diagnostics or bounded response handling. New
 * ASU request shapes should call this transport after validation instead of copying retry logic.
 */

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 10_000;
const MAX_RETRY_WINDOW_MS = 15_000;
const RETRY_JITTER_RATIO = 0.2;
const PROVIDER_CONNECTION_ERROR_MESSAGE = "ASU AIML provider connection failed.";
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Calculates a capped retry delay with additive jitter while respecting Retry-After. */
function getRetryDelayMs(attempt: number, response?: Response): number {
  const retryAfterDelayMs = getRetryAfterDelayMs(response);
  const baseDelayMs =
    retryAfterDelayMs ?? Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  const maxJitterMs = Math.min(
    Math.floor(baseDelayMs * RETRY_JITTER_RATIO),
    MAX_RETRY_DELAY_MS - baseDelayMs,
  );
  return baseDelayMs + Math.floor(Math.random() * (maxJitterMs + 1));
}

function getRetryAfterDelayMs(response?: Response): number | undefined {
  const retryAfter = response?.headers.get("Retry-After")?.trim();
  if (!retryAfter) return undefined;

  const retryAfterSeconds = Number(retryAfter);
  if (Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }
  return undefined;
}

function canWaitForRetry(retryDeadline: number, delayMs: number): boolean {
  return Date.now() + delayMs < retryDeadline;
}

function waitForDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

type RequestError = Error & { retryable: boolean };

const requestErrors = new WeakSet<Error>();

/** Identifies errors created at this request boundary without trusting arbitrary transport errors. */
function isRequestError(error: Error): error is RequestError {
  return requestErrors.has(error);
}

function isPersistentRateLimitBody(rawBody: string): boolean {
  return /rate limit/i.test(rawBody) || /project has exceeded/i.test(rawBody);
}

function createRequestError(message: string, retryable: boolean): RequestError {
  const error = Object.assign(new Error(message), { retryable });
  requestErrors.add(error);
  return error;
}

/**
 * Sends one already-validated ASU AIML query body with bounded retries and secret-safe failures.
 * Callers own request-shape construction; this boundary owns all response-body and retry behavior.
 */
export async function sendAsuAimlRequest(
  config: AsuAimlProviderConfig,
  body: Record<string, unknown>,
): Promise<ReviewProviderResult> {
  const retryDeadline = Date.now() + MAX_RETRY_WINDOW_MS;
  let attemptsMade = 0;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    attemptsMade = attempt + 1;
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

      if (!response.ok) {
        const rawBody = await readAsuAimlErrorResponseBody(response);
        const requestError = createRequestError(
          `ASU AIML request failed with status ${response.status}.`,
          RETRYABLE_STATUS_CODES.has(response.status) && !isPersistentRateLimitBody(rawBody),
        );

        if (requestError.retryable && attempt < MAX_RETRY_ATTEMPTS - 1) {
          const delayMs = getRetryDelayMs(attempt, response);
          if (canWaitForRetry(retryDeadline, delayMs)) {
            clearTimeout(timeout);
            await waitForDelay(delayMs);
            continue;
          }
          requestError.retryable = false;
        }
        throw requestError;
      }

      return parseAsuAimlResponse(await readAsuAimlSuccessfulResponseBody(response));
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (isAbort) throw new Error(`ASU AIML request timed out after ${config.timeoutMs}ms.`);
      if (error instanceof AsuAimlResponseBodyLimitError) throw error;
      if (error instanceof Error && isAsuAimlResponseFormatError(error)) throw error;

      if (error instanceof Error && isRequestError(error)) {
        if (error.retryable === false) throw error;
        lastError = error;
        continue;
      }

      lastError = createRequestError(PROVIDER_CONNECTION_ERROR_MESSAGE, true);
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        const delayMs = getRetryDelayMs(attempt);
        if (canWaitForRetry(retryDeadline, delayMs)) {
          clearTimeout(timeout);
          await waitForDelay(delayMs);
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `ASU AIML request failed after ${attemptsMade} attempts: ${lastError?.message ?? "unknown error"}`,
  );
}
