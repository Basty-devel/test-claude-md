import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';

export class CloudflareProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api.cloudflare.com/client/v4';
  private static readonly DAILY_LIMIT = 10000;

  constructor(apiKey: string) {
    super({
      name: 'cloudflare',
      category: 'image',
      apiKey,
    });
    this.quota = {
      remaining: CloudflareProvider.DAILY_LIMIT,
      total: CloudflareProvider.DAILY_LIMIT,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('Cloudflare quota exhausted');
    }

    const startTime = Date.now();
    const response = await fetch(
      `${CloudflareProvider.BASE_URL}/accounts/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: request.prompt,
          negative_prompt: request.image?.negativePrompt || '',
          width: request.image?.width || 512,
          height: request.image?.height || 512,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.status}`);
    }

    const blob = await response.blob();
    const tokensUsed = 1;

    this.quota.remaining -= tokensUsed;
    if (this.quota.remaining <= 0) {
      this.quota.available = false;
    }

    return {
      content: `Image generated: ${URL.createObjectURL(blob)}`,
      tokensUsed,
      model: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      provider: 'cloudflare',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${CloudflareProvider.BASE_URL}/accounts/ai/models/search`,
        { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
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
