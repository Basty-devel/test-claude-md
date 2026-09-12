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

  it('should throw when route() is called on ConcreteProvider', async () => {
    const provider = new ConcreteProvider({
      name: 'test',
      category: 'chat'
    });

    const request = {
      prompt: 'Hello',
      taskType: 'chat' as const
    };

    await expect(provider.route(request)).rejects.toThrow('route() must be implemented by subclass');
  });

  it('should return quota.available from healthCheck()', async () => {
    const provider = new ConcreteProvider({
      name: 'test',
      category: 'code'
    });

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(true);

    provider.quota.available = false;
    const unhealthy = await provider.healthCheck();
    expect(unhealthy).toBe(false);
  });

  it('should delegate estimateTokens to TokenCounter.estimate()', () => {
    const provider = new ConcreteProvider({
      name: 'test',
      category: 'image'
    });

    expect(provider.estimateTokens('')).toBe(0);
    expect(provider.estimateTokens('1234')).toBe(1);
    expect(provider.estimateTokens('Hello world')).toBe(3);
    expect(provider.estimateTokens('12345678')).toBe(2);
  });
});
