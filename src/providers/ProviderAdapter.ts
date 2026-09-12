import { QuotaStatus, ProviderRequest, ProviderResponse } from '../types';

export interface ProviderAdapter {
  name: string;
  category: 'chat' | 'code' | 'image';
  quota: QuotaStatus;
  route(request: ProviderRequest): Promise<ProviderResponse>;
  healthCheck(): Promise<boolean>;
  estimateTokens(text: string): number;
}

export interface ConcreteProviderConfig {
  name: string;
  category: 'chat' | 'code' | 'image';
  apiKey?: string;
}

export class ConcreteProvider implements ProviderAdapter {
  name: string;
  category: 'chat' | 'code' | 'image';
  quota: QuotaStatus;
  protected apiKey?: string;

  constructor(config: ConcreteProviderConfig) {
    this.name = config.name;
    this.category = config.category;
    this.apiKey = config.apiKey;
    this.quota = {
      remaining: 1000,
      total: 1000,
      resetWindow: 'daily',
      nextReset: new Date(Date.now() + 24 * 60 * 60 * 1000),
      available: true
    };
  }

  async route(_request: ProviderRequest): Promise<ProviderResponse> {
    throw new Error('route() must be implemented by subclass');
  }

  async healthCheck(): Promise<boolean> {
    return this.quota.available;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
