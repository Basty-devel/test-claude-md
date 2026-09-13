import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from '../../src/router/Pool';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';

describe('Pool', () => {
  let pool: Pool;
  let mockChatProvider: ProviderAdapter;
  let mockCodeProvider: ProviderAdapter;
  let mockImageProvider: ProviderAdapter;

  beforeEach(() => {
    pool = new Pool();

    mockChatProvider = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    mockCodeProvider = {
      name: 'together',
      category: 'code',
      quota: { remaining: 500, total: 500, resetWindow: 'hourly', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    mockImageProvider = {
      name: 'segmind',
      category: 'image',
      quota: { remaining: 100, total: 100, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    pool.add(mockChatProvider);
    pool.add(mockCodeProvider);
    pool.add(mockImageProvider);
  });

  it('should add providers correctly', () => {
    expect(pool.getProviders('chat')).toHaveLength(1);
    expect(pool.getProviders('code')).toHaveLength(1);
    expect(pool.getProviders('image')).toHaveLength(1);
  });

  it('should return available providers only', () => {
    mockChatProvider.quota.available = false;
    expect(pool.getAvailableProviders('chat')).toHaveLength(0);
    expect(pool.getAvailableProviders('code')).toHaveLength(1);
  });

  it('should get provider by name', () => {
    const provider = pool.getByName('groq');
    expect(provider).toBe(mockChatProvider);
  });

  it('should return undefined for non-existent provider', () => {
    const provider = pool.getByName('nonexistent');
    expect(provider).toBeUndefined();
  });

  it('should remove provider', () => {
    pool.remove('groq');
    expect(pool.getProviders('chat')).toHaveLength(0);
  });

  it('should update quota status', () => {
    pool.updateQuota('groq', 500);
    expect(mockChatProvider.quota.remaining).toBe(500);
  });

  it('should mark provider unavailable when quota exhausted', () => {
    pool.updateQuota('groq', 1000);
    expect(mockChatProvider.quota.remaining).toBe(0);
    expect(mockChatProvider.quota.available).toBe(false);
  });

  it('should return all providers via getAllProviders', () => {
    const all = pool.getAllProviders();
    expect(all).toHaveLength(3);
    expect(all).toContain(mockChatProvider);
    expect(all).toContain(mockCodeProvider);
    expect(all).toContain(mockImageProvider);
  });

  it('should return empty array for category with no providers', () => {
    expect(pool.getProviders('chat')).toHaveLength(1);
    const emptyPool = new Pool();
    expect(emptyPool.getProviders('chat')).toHaveLength(0);
    expect(emptyPool.getAvailableProviders('chat')).toHaveLength(0);
    expect(emptyPool.getAllProviders()).toHaveLength(0);
  });

  it('should allow adding multiple providers of the same category', () => {
    const secondChatProvider: ProviderAdapter = {
      name: 'deepseek',
      category: 'chat',
      quota: { remaining: 200, total: 200, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
    pool.add(secondChatProvider);
    expect(pool.getProviders('chat')).toHaveLength(2);
    expect(pool.getAllProviders()).toHaveLength(4);
  });

  it('should replace provider when adding with same name', () => {
    const replacementChatProvider: ProviderAdapter = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 800, total: 800, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
    pool.add(replacementChatProvider);
    expect(pool.getProviders('chat')).toHaveLength(1);
    expect(pool.getByName('groq')).toBe(replacementChatProvider);
    expect(pool.getByName('groq')).not.toBe(mockChatProvider);
  });

  it('should handle removing non-existent provider without error', () => {
    expect(() => pool.remove('nonexistent')).not.toThrow();
  });

  it('should handle updateQuota for non-existent provider without error', () => {
    expect(() => pool.updateQuota('nonexistent', 100)).not.toThrow();
  });

  it('should clamp remaining quota to zero when tokensUsed exceeds remaining', () => {
    pool.updateQuota('groq', 1500);
    expect(mockChatProvider.quota.remaining).toBe(0);
    expect(mockChatProvider.quota.available).toBe(false);
  });

  it('should keep remaining quota clamped at zero on repeated updateQuota calls after exhaustion', () => {
    pool.updateQuota('groq', 1000);
    pool.updateQuota('groq', 50);
    expect(mockChatProvider.quota.remaining).toBe(0);
    expect(mockChatProvider.quota.available).toBe(false);
  });

  describe('CachePin advisory tracking', () => {
    it('should return null for a pin with no recorded provider', () => {
      expect(pool.preferredFor('unseen-pin')).toBeNull();
    });

    it('should return the recorded provider name for a known pin', () => {
      pool.recordPin('pin-a', 'groq');
      expect(pool.preferredFor('pin-a')).toBe('groq');
    });

    it('should overwrite the preferred provider when the same pin is recorded again', () => {
      pool.recordPin('pin-a', 'groq');
      pool.recordPin('pin-a', 'together');
      expect(pool.preferredFor('pin-a')).toBe('together');
    });

    it('should track multiple pins independently', () => {
      pool.recordPin('pin-a', 'groq');
      pool.recordPin('pin-b', 'together');
      expect(pool.preferredFor('pin-a')).toBe('groq');
      expect(pool.preferredFor('pin-b')).toBe('together');
    });

    it('should not associate a pin with a provider that was never recorded for it', () => {
      pool.recordPin('pin-a', 'groq');
      expect(pool.preferredFor('pin-b')).toBeNull();
    });
  });
});
