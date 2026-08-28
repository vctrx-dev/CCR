import { assertAsuAimlSecureBaseUrl } from "./asu-api-config.js";
import { sendAsuAimlRequest } from "./asu-api-transport.js";
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
 * ASU AIML provider adapter. Extend provider support through `ReviewProvider`; this module owns
 * only ASU message conversion and delegates transport safety to `asu-api-transport.ts`.
 */

function convertMessagesToAsuFormat(messages: ReviewProviderMessage[]): {
  systemPrompt: string;
  query: string;
} {
  const systemParts = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const userMessages = messages.filter((message) => message.role === "user");
  const lastUserMessage = userMessages.at(-1);
  if (!lastUserMessage) throw new Error("No user message found in provider input.");
  return { systemPrompt: systemParts.join("\n\n"), query: lastUserMessage.content };
}

/**
 * Sends a chat completion request to the ASU AIML API with bounded retry and response handling.
 * The URL is revalidated at this public boundary before a bearer credential can be sent.
 */
export async function requestAsuAimlChatCompletion(
  config: AsuAimlProviderConfig,
  messages: ReviewProviderMessage[],
): Promise<ReviewProviderResult> {
  assertAsuAimlSecureBaseUrl(config.baseUrl);
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
  if (config.modelProvider.trim().length > 0) body.model_provider = config.modelProvider;
  return sendAsuAimlRequest(config, body);
}

/** Creates a ReviewProvider backed by the ASU AIML API. */
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
