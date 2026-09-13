import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachePin } from '../../src/router/CachePin';
import { Pool } from '../../src/router/Pool';
import { Router } from '../../src/router/Router';
import { PriorityStrategy } from '../../src/router/strategies/PriorityStrategy';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';
import { Message } from '../../src/types';

describe('CachePin', () => {
  it('is stable for same prefix and varies for different', () => {
    const a = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
    const b = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
    const c = new CachePin().forMessages([{ role: 'system', content: 'other' }]);
    expect(a.pin).toBe(b.pin);
    expect(a.pin).not.toBe(c.pin);
  });

  it('advisory: prefers the pinned provider among candidates, no-op when none cached', () => {
    const pin = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
    expect(pin.choose(null, ['groq', 'gemini'])).toBeNull();
    expect(pin.choose('groq', ['groq', 'gemini'])).toBe('groq');
  });

  it('choose returns null when preferred is not in candidates', () => {
    const pin = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
    expect(pin.choose('groq', ['gemini', 'together'])).toBeNull();
  });

  it('header contains x-omnifree-cache-pin with the pin value', () => {
    const pin = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
    expect(pin.header).toHaveProperty('x-omnifree-cache-pin');
    expect(pin.header['x-omnifree-cache-pin']).toBe(pin.pin);
  });

  it('different message orders produce different pins', () => {
    const a = new CachePin().forMessages([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' }
    ]);
    const b = new CachePin().forMessages([
      { role: 'user', content: 'hello' },
      { role: 'system', content: 'sys' }
    ]);
    expect(a.pin).not.toBe(b.pin);
  });

  it('empty messages produces a valid pin', () => {
    const pin = new CachePin().forMessages([]);
    expect(pin.pin).toBeTruthy();
    expect(typeof pin.pin).toBe('string');
    expect(pin.pin.length).toBeGreaterThan(0);
  });
});

describe('Pool pin tracking', () => {
  let pool: Pool;

  const makeProvider = (name: string): ProviderAdapter => ({
    name,
    category: 'chat',
    quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
    route: vi.fn(),
    healthCheck: vi.fn(),
    estimateTokens: vi.fn()
  });

  beforeEach(() => {
    pool = new Pool();
  });

  it('recordPin stores provider name for a pin', () => {
    pool.add(makeProvider('groq'));
    pool.recordPin('abc123', 'groq');
    expect(pool.preferredFor('abc123')).toBe('groq');
  });

  it('preferredFor returns null for unknown pin', () => {
    expect(pool.preferredFor('unknown')).toBeNull();
  });

  it('recordPin overwrites previous provider for same pin', () => {
    pool.add(makeProvider('groq'));
    pool.add(makeProvider('gemini'));
    pool.recordPin('abc123', 'groq');
    pool.recordPin('abc123', 'gemini');
    expect(pool.preferredFor('abc123')).toBe('gemini');
  });
});

describe('Router CachePin integration', () => {
  let router: Router;
  let pool: Pool;
  let strategy: PriorityStrategy;
  let groqProvider: ProviderAdapter;
  let geminiProvider: ProviderAdapter;

  beforeEach(() => {
    pool = new Pool();
    strategy = new PriorityStrategy();

    groqProvider = {
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

    geminiProvider = {
      name: 'gemini',
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn().mockResolvedValue({
        content: 'Hello!',
        tokensUsed: 10,
        model: 'gemini-2.0-flash',
        provider: 'gemini',
        latency: 100
      }),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    pool.add(groqProvider);
    pool.add(geminiProvider);
    strategy.setPriority('groq', 5);
    strategy.setPriority('gemini', 10);

    router = new Router(pool, strategy);
  });

  it('routes to strategy selection when no pin is provided', async () => {
    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request);
    expect(response.provider).toBe('gemini');
  });

  it('advisory tie-break routes to pinned provider when available', async () => {
    const messages: Message[] = [{ role: 'system', content: 'sys context' }];
    const pin = new CachePin().forMessages(messages);
    pool.recordPin(pin.pin, 'groq');

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request, { cachePin: pin.pin });

    expect(response.provider).toBe('groq');
  });

  it('falls back to strategy when pinned provider is unavailable', async () => {
    const messages: Message[] = [{ role: 'system', content: 'sys context' }];
    const pin = new CachePin().forMessages(messages);
    pool.recordPin(pin.pin, 'groq');
    groqProvider.quota.available = false;

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request, { cachePin: pin.pin });

    expect(response.provider).toBe('gemini');
  });

  it('falls back to strategy when pinned provider is not in candidates', async () => {
    // Pin references a provider that does not exist in the pool at all.
    const messages: Message[] = [{ role: 'system', content: 'sys context' }];
    const pin = new CachePin().forMessages(messages);
    pool.recordPin(pin.pin, 'nonexistent');

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request, { cachePin: pin.pin });

    // Falls back to strategy (gemini has higher priority).
    expect(response.provider).toBe('gemini');
  });

  it('records pin after successful route', async () => {
    const messages: Message[] = [{ role: 'system', content: 'sys' }];
    const pin = new CachePin().forMessages(messages);

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    await router.route(request, { cachePin: pin.pin });

    expect(pool.preferredFor(pin.pin)).toBe('gemini');
  });

  it('does not record pin when no cachePin provided', async () => {
    const request = { prompt: 'Hello', taskType: 'chat' as const };
    await router.route(request);

    expect(pool.preferredFor('any-pin')).toBeNull();
  });

  it('returns cache-pin header in response when cachePin provided', async () => {
    const messages: Message[] = [{ role: 'system', content: 'sys' }];
    const pin = new CachePin().forMessages(messages);

    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request, { cachePin: pin.pin });

    expect(response.cachePinHeader).toEqual({ 'x-omnifree-cache-pin': pin.pin });
  });

  it('no cachePinHeader when no cachePin provided', async () => {
    const request = { prompt: 'Hello', taskType: 'chat' as const };
    const response = await router.route(request);

    expect(response.cachePinHeader).toBeUndefined();
  });

  function makeProvider(name: string): ProviderAdapter {
    return {
      name,
      category: 'chat',
      quota: { remaining: 1000, total: 1000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn().mockResolvedValue({
        content: 'Hello!',
        tokensUsed: 10,
        model: 'model',
        provider: name,
        latency: 100
      }),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
  }
});
