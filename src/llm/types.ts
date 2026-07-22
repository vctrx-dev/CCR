export interface AsuAimlProviderConfig {
  apiKey: string;
  baseUrl: string;
  modelProvider: string;
  model: string;
  temperature: number;
  timeoutMs: number;
}

export interface ReviewProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ReviewProviderRequest {
  messages: ReviewProviderMessage[];
}

export interface ReviewTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ReviewProviderResult {
  output: string;
  usage?: Partial<ReviewTokenUsage>;
  estimatedCostUsd?: number;
}

export interface ReviewProvider {
  review(input: ReviewProviderRequest): Promise<string | ReviewProviderResult>;
}
