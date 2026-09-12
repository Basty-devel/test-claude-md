import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuotaForecast } from '../../src/features/QuotaForecast';
import { Pool } from '../../src/router/Pool';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';

describe('QuotaForecast', () => {
  let forecast: QuotaForecast;
  let pool: Pool;
  let now: number;

  beforeEach(() => {
    pool = new Pool();
    forecast = new QuotaForecast(pool);
    now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate exhaustion time based on usage rate', () => {
    const provider: ProviderAdapter = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 14000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: async () => ({ content: '', tokensUsed: 100, model: '', provider: 'groq', latency: 0 }),
      healthCheck: async () => true,
      estimateTokens: () => 100
    };

    pool.add(provider);
    forecast.recordUsage('groq', 100);

    vi.setSystemTime(now + 60000);

    forecast.recordUsage('groq', 100);

    const prediction = forecast.predict('groq');

    expect(prediction).not.toBeNull();
    expect(prediction!.remainingTokens).toBe(1000);
    expect(prediction!.tokensPerMinute).toBeGreaterThan(0);
  });

  it('should return null for unknown provider', () => {
    const prediction = forecast.predict('unknown');
    expect(prediction).toBeNull();
  });
});
