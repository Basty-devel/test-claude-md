import { ProviderRequest, ProviderResponse } from '../types';

const OLLAMA_ENDPOINT = 'http://localhost:11434/v1';
const DEFAULT_MODEL = 'llama3.2';

/**
 * OfflineEmergency — last-resort fallback when all providers exhausted.
 * Routes to local Ollama/llama.cpp if available.
 */
export class OfflineEmergency {
  private endpoint: string;
  private model: string;

  constructor(endpoint = OLLAMA_ENDPOINT, model = DEFAULT_MODEL) {
    this.endpoint = endpoint;
    this.model = model;
  }

  /**
   * Route a request to the local Ollama instance.
   */
  async route(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama not available: ${response.status}`);
    }

    const data = await response.json();
    const tokensUsed = data.usage?.total_tokens ?? 0;

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      tokensUsed,
      model: this.model,
      provider: 'ollama-local',
      latency: Date.now() - startTime,
    };
  }

  /**
   * Check if Ollama is running and model is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/models`);
      return response.ok;
    } catch {
      return false;
    }
  }
}