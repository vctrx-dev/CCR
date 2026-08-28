import { z } from "zod";
import type { AsuAimlProviderConfig } from "./types.js";

const ASU_DEFAULTS = {
  baseUrl: "https://api-main.aiml.asu.edu/queryV2",
  modelProvider: "openai",
  temperature: 0.2,
  timeoutMs: 120000,
  inputCostPer1MUsd: 5,
  outputCostPer1MUsd: 15,
} as const;

/** Default model provider identifier sent in query requests. */
export const DEFAULT_ASU_MODEL_PROVIDER = ASU_DEFAULTS.modelProvider;

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https:\/\//i.test(value), {
    message: "Expected an HTTPS URL.",
  })
  .refine(
    (value) => {
      try {
        const endpoint = new URL(value);
        return endpoint.username.length === 0 && endpoint.password.length === 0;
      } catch {
        return false;
      }
    },
    {
      message: "ASU AIML endpoint URL must not include credentials.",
    },
  );

/**
 * Validates an endpoint used with an ASU bearer credential.
 *
 * Keep direct request callers behind this boundary so they cannot bypass config construction.
 * URL userinfo is forbidden because it can be exposed by transport failures and would duplicate a
 * credential in an unsafe URL field.
 */
export function assertAsuAimlSecureBaseUrl(baseUrl: string): void {
  const result = httpsUrlSchema.safeParse(baseUrl);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid ASU AIML endpoint URL.");
  }
}

const providerConfigSchema = z.object({
  apiKey: z.string().trim().min(1, "apiKey must not be empty."),
  baseUrl: httpsUrlSchema,
  modelProvider: z.string().trim().min(1),
  model: z.string().trim().min(1, "model must not be empty."),
  temperature: z.number().finite().min(0).max(2),
  timeoutMs: z.number().finite().int().positive(),
});

const costEstimateSchema = z.object({
  promptTokens: z.number().finite().int().nonnegative(),
  completionTokens: z.number().finite().int().nonnegative(),
  inputRate: z.number().finite().nonnegative(),
  outputRate: z.number().finite().nonnegative(),
});

function readNumericEnv(value: string | undefined, fallback: number): number {
  const normalized = value?.trim();
  return normalized ? Number(normalized) : fallback;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
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
  return providerConfigSchema.parse({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl?.trim() || ASU_DEFAULTS.baseUrl,
    modelProvider: normalizeOptionalString(input.modelProvider) ?? ASU_DEFAULTS.modelProvider,
    model: input.model,
    temperature: input.temperature ?? ASU_DEFAULTS.temperature,
    timeoutMs: input.timeoutMs ?? ASU_DEFAULTS.timeoutMs,
  });
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
    modelProvider: env.ASU_MODEL_PROVIDER,
    model,
    temperature: readNumericEnv(env.ASU_TEMPERATURE, ASU_DEFAULTS.temperature),
    timeoutMs: readNumericEnv(env.ASU_TIMEOUT_MS, ASU_DEFAULTS.timeoutMs),
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
  const { inputRate, outputRate } = costEstimateSchema.parse({
    promptTokens,
    completionTokens,
    inputRate: readNumericEnv(
      process.env.CCR_EST_INPUT_COST_PER_1M_USD,
      ASU_DEFAULTS.inputCostPer1MUsd,
    ),
    outputRate: readNumericEnv(
      process.env.CCR_EST_OUTPUT_COST_PER_1M_USD,
      ASU_DEFAULTS.outputCostPer1MUsd,
    ),
  });
  return Number(
    ((promptTokens / 1_000_000) * inputRate + (completionTokens / 1_000_000) * outputRate).toFixed(
      6,
    ),
  );
}
