import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export class TogetherProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.together.xyz/v1';
  private static readonly RATE_LIMIT = 20; // 20 req/min
  private static readonly MODEL = 'codellama/codellama-34b-instruct';

  private requestCount = 0;
  private windowStart = Date.now();

  constructor(apiKey: string) {
    super({
      name: 'together',
      category: 'code',
      apiKey,
    });
    this.quota = {
      remaining: 1000,
      total: 1000,
      resetWindow: 'hourly',
      nextReset: new Date(Date.now() + 60 * 60 * 1000),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Together quota exhausted');
    }

    // Rate limit: 20 req/min
    const now = Date.now();
    if (now - this.windowStart > 60000) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    if (this.requestCount >= TogetherProvider.RATE_LIMIT) {
      throw new Error('Together rate limit exceeded');
    }
    this.requestCount++;

    const startTime = Date.now();
    const response = await fetch(`${TogetherProvider.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TogetherProvider.MODEL,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Together API error: ${response.status}`);
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
      model: TogetherProvider.MODEL,
      provider: 'together',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${TogetherProvider.BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
