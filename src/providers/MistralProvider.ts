import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export class MistralProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.mistral.ai/v1';
  private static readonly RATE_LIMIT_MS = 1000; // 1 req/sec
  private static readonly MODEL = 'mistral-small-latest';

  private lastRequestTime = 0;

  constructor(apiKey: string) {
    super({
      name: 'mistral',
      category: 'chat',
      apiKey,
    });
    this.quota = {
      remaining: 1000,
      total: 1000,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Mistral quota exhausted');
    }

    // Rate limit: 1 req/sec
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < MistralProvider.RATE_LIMIT_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MistralProvider.RATE_LIMIT_MS - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    const startTime = Date.now();

    const response = await fetch(`${MistralProvider.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MistralProvider.MODEL,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const data = await response.json();
    const tokensUsed = TokenCounter.fromUsage(data.usage);

    this.quota.remaining -= tokensUsed;
    if (this.quota.remaining <= 0) {
      this.quota.available = false;
    }

    return {
      content: data.choices[0].message.content,
      tokensUsed,
      model: MistralProvider.MODEL,
      provider: 'mistral',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${MistralProvider.BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
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
