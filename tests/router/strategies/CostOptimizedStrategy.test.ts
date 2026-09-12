import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CostOptimizedStrategy } from '../../../src/router/strategies/CostOptimizedStrategy';
import { ProviderAdapter } from '../../../src/providers/ProviderAdapter';

describe('CostOptimizedStrategy', () => {
  let strategy: CostOptimizedStrategy;
  let highQuota: ProviderAdapter;
  let lowQuota: ProviderAdapter;

  beforeEach(() => {
    strategy = new CostOptimizedStrategy();

    highQuota = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    lowQuota = {
      name: 'mistral',
      category: 'chat',
      quota: { remaining: 100, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
  });

  it('should select provider with highest quota ratio', () => {
    const selected = strategy.select([highQuota, lowQuota], 'chat');
    expect(selected?.name).toBe('groq');
  });

  it('should respect custom weights', () => {
    strategy.setWeight('mistral', 10.0);
    const selected = strategy.select([highQuota, lowQuota], 'chat');
    expect(selected?.name).toBe('mistral');
  });

  it('should skip unavailable providers', () => {
    highQuota.quota.available = false;
    const selected = strategy.select([highQuota, lowQuota], 'chat');
    expect(selected?.name).toBe('mistral');
  });

  it('should return null if all providers unavailable', () => {
    highQuota.quota.available = false;
    lowQuota.quota.available = false;
    const result = strategy.select([highQuota, lowQuota], 'chat');
    expect(result).toBeNull();
  });

  it('should return null for empty provider list', () => {
    const result = strategy.select([], 'chat');
    expect(result).toBeNull();
  });

  it('should default weight to 1.0 for unknown providers', () => {
    const midQuota: ProviderAdapter = {
      name: 'deepseek',
      category: 'chat',
      quota: { remaining: 500, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
    // groq: 1000/1000 = 1.0 score, deepseek: 500/1000 = 0.5 score, mistral: 100/1000 = 0.1 score
    const selected = strategy.select([lowQuota, midQuota, highQuota], 'chat');
    expect(selected?.name).toBe('groq');
  });

  it('should handle weight overrides changing selection', () => {
    // mistral at low quota but heavy weight beats groq at full quota
    strategy.setWeight('groq', 0.1);
    strategy.setWeight('mistral', 100.0);
    const selected = strategy.select([highQuota, lowQuota], 'chat');
    expect(selected?.name).toBe('mistral');
  });

  it('should handle providers with zero remaining quota', () => {
    const exhausted: ProviderAdapter = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 0, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    const selected = strategy.select([exhausted, lowQuota], 'chat');
    expect(selected?.name).toBe('mistral');
  });
});
