import type { AsuAimlProviderConfig } from "./types.js";

/**
 * Default model provider identifier sent in query requests.
 */
export const DEFAULT_ASU_MODEL_PROVIDER = "openai";

const DEFAULT_ASU_BASE_URL = "https://api-main.aiml.asu.edu/queryV2";
const DEFAULT_ASU_TEMPERATURE = 0.2;
const DEFAULT_ASU_TIMEOUT_MS = 120000;
const DEFAULT_INPUT_COST_PER_1M_USD = 5;
const DEFAULT_OUTPUT_COST_PER_1M_USD = 15;

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

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

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
 * @param env - Process environment object.
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

/**
 * Estimates request cost using configurable input and output token rates.
 *
 * @param promptTokens - Number of input tokens.
 * @param completionTokens - Number of output tokens.
 * @returns Estimated cost in USD rounded to six decimal places.
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
