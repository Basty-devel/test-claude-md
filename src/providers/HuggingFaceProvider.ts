import { ConcreteProvider } from './ProviderAdapter';
import { ProviderRequest, ProviderResponse } from '../types';

export class HuggingFaceProvider extends ConcreteProvider {
  private static readonly BASE_URL = 'https://api-inference.huggingface.co/models';
  private static readonly MODEL = 'codellama/CodeLlama-34b-Instruct-hf';

  constructor(apiKey: string) {
    super({
      name: 'huggingface',
      category: 'code',
      apiKey,
    });
    this.quota = {
      remaining: 500,
      total: 500,
      resetWindow: 'daily',
      nextReset: this.getNextResetTime(),
      available: true,
    };
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.quota.available) {
      throw new Error('HuggingFace quota exhausted');
    }

    const startTime = Date.now();
    const response = await fetch(`${HuggingFaceProvider.BASE_URL}/${HuggingFaceProvider.MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: request.prompt,
        parameters: { max_new_tokens: request.maxTokens || 1024 },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data = await response.json();
    const content = Array.isArray(data) ? data[0].generated_text : data.generated_text;
    const tokensUsed = this.estimateTokens(content);

    this.quota.remaining -= tokensUsed;
    if (this.quota.remaining <= 0) {
      this.quota.available = false;
    }

    return {
      content,
      tokensUsed,
      model: HuggingFaceProvider.MODEL,
      provider: 'huggingface',
      latency: Date.now() - startTime,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${HuggingFaceProvider.BASE_URL}/${HuggingFaceProvider.MODEL}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ inputs: 'test' }),
      });
      return response.ok || response.status === 503; // 503 = model loading
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
