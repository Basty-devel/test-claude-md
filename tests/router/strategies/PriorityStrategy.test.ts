import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriorityStrategy } from '../../../src/router/strategies/PriorityStrategy';
import { ProviderAdapter } from '../../../src/providers/ProviderAdapter';

describe('PriorityStrategy', () => {
  let strategy: PriorityStrategy;
  let highPriority: ProviderAdapter;
  let lowPriority: ProviderAdapter;

  beforeEach(() => {
    strategy = new PriorityStrategy();

    highPriority = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    lowPriority = {
      name: 'mistral',
      category: 'chat',
      quota: { remaining: 500, total: 500, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    strategy.setPriority('groq', 10);
    strategy.setPriority('mistral', 5);
  });

  it('should select highest priority provider', () => {
    const selected = strategy.select([highPriority, lowPriority], 'chat');
    expect(selected?.name).toBe('groq');
  });

  it('should skip unavailable providers', () => {
    highPriority.quota.available = false;
    const selected = strategy.select([highPriority, lowPriority], 'chat');
    expect(selected?.name).toBe('mistral');
  });

  it('should return null if all providers unavailable', () => {
    highPriority.quota.available = false;
    lowPriority.quota.available = false;
    const selected = strategy.select([highPriority, lowPriority], 'chat');
    expect(selected).toBeNull();
  });
});
