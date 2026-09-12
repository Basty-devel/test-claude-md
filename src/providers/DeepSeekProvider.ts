import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export class DeepSeekProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.deepseek.com/v1';
  private static readonly DAILY_LIMIT = 5000;
  private static readonly MODEL = 'deepseek-chat';

  constructor(apiKey: string) {
    super({
      name: 'deepseek',
      category: 'chat',
      apiKey,
    });
    this.quota = {
      remaining: DeepSeekProvider.DAILY_LIMIT,
      total: DeepSeekProvider.DAILY_LIMIT,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('DeepSeek quota exhausted');
    }

    const startTime = Date.now();

    const response = await fetch(`${DeepSeekProvider.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DeepSeekProvider.MODEL,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
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
      model: DeepSeekProvider.MODEL,
      provider: 'deepseek',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${DeepSeekProvider.BASE_URL}/models`, {
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
