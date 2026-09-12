import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../../src/router/Router';
import { Pool } from '../../src/router/Pool';
import { PriorityStrategy } from '../../src/router/strategies/PriorityStrategy';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';

describe('Router', () => {
  let router: Router;
  let pool: Pool;
  let strategy: PriorityStrategy;
  let mockProvider: ProviderAdapter;

  beforeEach(() => {
    pool = new Pool();
    strategy = new PriorityStrategy();
    router = new Router(pool, strategy);

    mockProvider = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn().mockResolvedValue({
        content: 'Hello!',
        tokensUsed: 10,
        model: 'llama-3.3-70b',
        provider: 'groq',
        latency: 100
      }),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    pool.add(mockProvider);
    strategy.setPriority('groq', 10);
  });

  it('should route request to selected provider', async () => {
    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request);

    expect(response.content).toBe('Hello!');
    expect(response.provider).toBe('groq');
    expect(mockProvider.route).toHaveBeenCalledWith(request);
  });

  it('should throw error if no providers available', async () => {
    mockProvider.quota.available = false;
    const request = { prompt: 'Hello', taskType: 'chat' as const };

    await expect(router.route(request)).rejects.toThrow('No available providers for chat');
  });

  it('should update quota after routing', async () => {
    const request = { prompt: 'Hello', taskType: 'chat' as const };
    await router.route(request);

    expect(mockProvider.quota.remaining).toBe(990);
  });

  it('should throw error when strategy returns null despite available providers', async () => {
    const nullStrategy = {
      select: vi.fn().mockReturnValue(null),
      setPriority: vi.fn()
    };

    const nullStrategyRouter = new Router(pool, nullStrategy as unknown as PriorityStrategy);

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    await expect(nullStrategyRouter.route(request)).rejects.toThrow(
      'Strategy returned no provider for chat'
    );

    expect(nullStrategy.select).toHaveBeenCalledWith(
      expect.arrayContaining([mockProvider]),
      'chat'
    );
  });
});
