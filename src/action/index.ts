import * as core from "@actions/core";
import { createAsuAimlProvider, createAsuAimlProviderConfig } from "../llm/asu-api.js";

/**
 * Reads an optional GitHub Action input, returning undefined when blank.
 *
 * @param name - Input name.
 * @returns Trimmed value or undefined.
 */
function readOptionalInput(name: string): string | undefined {
  const value = core.getInput(name);
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

/**
 * Reads a float input from GitHub Action inputs with a fallback default.
 *
 * @param name - Input name.
 * @param fallback - Default value.
 * @returns Parsed float.
 */
function readFloatInput(name: string, fallback: number): number {
  const raw = core.getInput(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Input ${name} must be a number.`);
  }

  return parsed;
}

/**
 * Reads a positive integer input from GitHub Action inputs with a fallback default.
 *
 * @param name - Input name.
 * @param fallback - Default value.
 * @returns Parsed positive integer.
 */
function readIntegerInput(name: string, fallback: number): number {
  const raw = core.getInput(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`Input ${name} must be a positive integer.`);
  }

  return parsed;
}

/**
 * Builds the ASU AIML provider from GitHub Action inputs.
 * Reads api-key, base-url, model-provider, model, temperature, and request-timeout-ms.
 *
 * @returns Configured ASU AImL ReviewProvider.
 */
function buildProvider() {
  const apiKey = core.getInput("api-key", { required: true });
  const baseUrl = readOptionalInput("base-url");
  const modelProvider = readOptionalInput("model-provider");
  const model = core.getInput("model", { required: true });
  const temperature = readFloatInput("temperature", 0.2);
  const timeoutMs = readIntegerInput("request-timeout-ms", 120000);

  return createAsuAimlProvider(
    createAsuAimlProviderConfig({
      apiKey,
      baseUrl,
      modelProvider,
      model,
      temperature,
      timeoutMs,
    }),
  );
}

/**
 * Main entry point for the GitHub Action.
 * Initializes the ASU AIML provider and sets output metadata.
 */
async function main(): Promise<void> {
  try {
    core.info("CCR: Initializing ASU AIML provider...");
    const provider = buildProvider();
    core.info("CCR: ASU AIML provider initialized.");

    core.setOutput("provider", "asu-aiml");
    core.info("CCR action completed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void main();
