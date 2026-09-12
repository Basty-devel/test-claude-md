import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';

export class SegmindProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.segmind.com/v1';
  private static readonly MODEL = 'sd-xl-turbo';
  private static readonly DAILY_LIMIT = 100;

  constructor(apiKey: string) {
    super({
      name: 'segmind',
      category: 'image',
      apiKey,
    });
    this.quota = {
      remaining: SegmindProvider.DAILY_LIMIT,
      total: SegmindProvider.DAILY_LIMIT,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Segmind quota exhausted');
    }

    const startTime = Date.now();
    const response = await fetch(`${SegmindProvider.BASE_URL}/${SegmindProvider.MODEL}`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: request.prompt,
        negative_prompt: request.image?.negativePrompt || '',
        width: request.image?.width || 512,
        height: request.image?.height || 512,
        samples: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Segmind API error: ${response.status}`);
    }

    const blob = await response.blob();
    const tokensUsed = 1; // Image generation = 1 token unit

    this.quota.remaining -= tokensUsed;
    if (this.quota.remaining <= 0) {
      this.quota.available = false;
    }

    return {
      content: `Image generated: ${URL.createObjectURL(blob)}`,
      tokensUsed,
      model: SegmindProvider.MODEL,
      provider: 'segmind',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${SegmindProvider.BASE_URL}/models`, {
        headers: { 'x-api-key': this.apiKey! },
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
