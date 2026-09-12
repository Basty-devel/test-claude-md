import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export class GroqProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.groq.com/openai/v1';
  private static readonly DAILY_LIMIT = 14000;
  private static readonly MODEL = 'llama-3.3-70b-versatile';

  constructor(apiKey: string) {
    super({
      name: 'groq',
      category: 'chat',
      apiKey,
    });
    this.quota = {
      remaining: GroqProvider.DAILY_LIMIT,
      total: GroqProvider.DAILY_LIMIT,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Groq quota exhausted');
    }

    const startTime = Date.now();

    const response = await fetch(`${GroqProvider.BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GroqProvider.MODEL,
        messages: [{ role: 'user', content: request.prompt }],
        max_tokens: request.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
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
      model: GroqProvider.MODEL,
      provider: 'groq',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${GroqProvider.BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
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
