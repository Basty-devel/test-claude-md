import { describe, it, expect, vi } from 'vitest';
import { ProviderAdapter, ConcreteProvider } from '../../src/providers/ProviderAdapter';

describe('ProviderAdapter', () => {
  it('should define interface contract', () => {
    const provider: ProviderAdapter = {
      name: 'test',
      category: 'chat',
      quota: {
        remaining: 1000,
        total: 1000,
        resetWindow: 'daily',
        nextReset: new Date(),
        available: true
      },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    expect(provider.name).toBe('test');
    expect(provider.category).toBe('chat');
  });

  it('should work with ConcreteProvider implementation', async () => {
    const provider = new ConcreteProvider({
      name: 'test',
      category: 'chat',
      apiKey: 'test-key'
    });

    expect(provider.name).toBe('test');
    expect(provider.category).toBe('chat');
    expect(provider.quota.available).toBe(true);
  });
});
