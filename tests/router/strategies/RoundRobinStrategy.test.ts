import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoundRobinStrategy } from '../../../src/router/strategies/RoundRobinStrategy';
import { ProviderAdapter } from '../../../src/providers/ProviderAdapter';

describe('RoundRobinStrategy', () => {
  let strategy: RoundRobinStrategy;
  let provider1: ProviderAdapter;
  let provider2: ProviderAdapter;

  beforeEach(() => {
    strategy = new RoundRobinStrategy();

    provider1 = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    provider2 = {
      name: 'mistral',
      category: 'chat',
      quota: { remaining: 500, total: 500, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
  });

  it('should alternate between providers', () => {
    const first = strategy.select([provider1, provider2], 'chat');
    const second = strategy.select([provider1, provider2], 'chat');
    const third = strategy.select([provider1, provider2], 'chat');

    expect(first?.name).toBe('groq');
    expect(second?.name).toBe('mistral');
    expect(third?.name).toBe('groq');
  });

  it('should skip unavailable providers', () => {
    provider1.quota.available = false;
    const first = strategy.select([provider1, provider2], 'chat');
    const second = strategy.select([provider1, provider2], 'chat');

    expect(first?.name).toBe('mistral');
    expect(second?.name).toBe('mistral');
  });

  it('should return null if all providers unavailable', () => {
    provider1.quota.available = false;
    provider2.quota.available = false;
    const result = strategy.select([provider1, provider2], 'chat');
    expect(result).toBeNull();
  });

  it('should wrap around after reaching end of list', () => {
    const provider3: ProviderAdapter = {
      name: 'deepseek',
      category: 'chat',
      quota: { remaining: 200, total: 200, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    const first = strategy.select([provider1, provider2, provider3], 'chat');
    const second = strategy.select([provider1, provider2, provider3], 'chat');
    const third = strategy.select([provider1, provider2, provider3], 'chat');
    const fourth = strategy.select([provider1, provider2, provider3], 'chat');

    expect(first?.name).toBe('groq');
    expect(second?.name).toBe('mistral');
    expect(third?.name).toBe('deepseek');
    expect(fourth?.name).toBe('groq');
  });

  it('should reset pointer gracefully when unavailable providers are removed', () => {
    const first = strategy.select([provider1, provider2], 'chat');
    expect(first?.name).toBe('groq');

    provider2.quota.available = false;
    const second = strategy.select([provider1, provider2], 'chat');
    expect(second?.name).toBe('groq');
  });

  it('should return null for empty provider list', () => {
    const result = strategy.select([], 'chat');
    expect(result).toBeNull();
  });
});
