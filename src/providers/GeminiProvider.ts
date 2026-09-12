import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export class GeminiProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
  private static readonly DAILY_LIMIT = 1500;
  private static readonly MODEL = 'gemini-2.0-flash';

  constructor(apiKey: string) {
    super({
      name: 'gemini',
      category: 'chat',
      apiKey,
    });
    this.quota = {
      remaining: GeminiProvider.DAILY_LIMIT,
      total: GeminiProvider.DAILY_LIMIT,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Gemini quota exhausted');
    }

    const startTime = Date.now();

    const response = await fetch(
      `${GeminiProvider.BASE_URL}/models/${GeminiProvider.MODEL}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: request.prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const tokensUsed =
      (data.usageMetadata?.promptTokenCount ?? 0) +
      (data.usageMetadata?.candidatesTokenCount ?? 0);

    this.quota.remaining -= tokensUsed;
    if (this.quota.remaining <= 0) {
      this.quota.available = false;
    }

    return {
      content: data.candidates[0].content.parts[0].text,
      tokensUsed,
      model: GeminiProvider.MODEL,
      provider: 'gemini',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${GeminiProvider.BASE_URL}/models?key=${this.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private getNextResetTime(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}
