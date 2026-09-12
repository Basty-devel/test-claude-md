import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { MistralProvider } from '../../src/providers/MistralProvider';
import { ProviderRequest } from '../../src/types';

describe('MistralProvider', () => {
  let provider: MistralProvider;

  beforeEach(() => {
    provider = new MistralProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('mistral');
    expect(provider.category).toBe('chat');
  });

  it('should have quota initialized', () => {
    expect(provider.quota.total).toBe(1000);
    expect(provider.quota.remaining).toBe(1000);
    expect(provider.quota.resetWindow).toBe('daily');
    expect(provider.quota.available).toBe(true);
  });

  it('should route chat request successfully', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from Mistral!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    const response = await provider.route(request);

    expect(response.content).toBe('Hello from Mistral!');
    expect(response.provider).toBe('mistral');
    expect(response.tokensUsed).toBe(18);
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Rate limited',
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('Mistral API error: 429');
  });

  it('should perform health check successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
    } as Response);

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should handle health check failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(false);
  });

  it('should decrement quota after successful route', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 50, completion_tokens: 30 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'chat' });

    expect(provider.quota.remaining).toBe(1000 - 80);
    expect(provider.quota.available).toBe(true);
  });

  it('should disable quota when remaining hits zero', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 500, completion_tokens: 500 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Big request', taskType: 'chat' });

    expect(provider.quota.remaining).toBe(0);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw error when quota is exhausted', async () => {
    provider.quota.available = false;

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('Mistral quota exhausted');
  });

  it('should send correct API request format with Authorization header', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test prompt', taskType: 'chat' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should sleep when two requests occur within 1000ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sleepSpy = vi.spyOn(global, 'setTimeout');

    const request: ProviderRequest = { prompt: 'First', taskType: 'chat' };

    // First request should not sleep
    const firstPromise = provider.route(request);
    await vi.advanceTimersByTimeAsync(0);
    await firstPromise;

    expect(sleepSpy).not.toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Number)
    );

    // Advance time by 100ms (less than 1000ms rate limit)
    vi.advanceTimersByTime(100);

    const secondRequest: ProviderRequest = { prompt: 'Second', taskType: 'chat' };
    const secondPromise = provider.route(secondRequest);

    // The route should have triggered a setTimeout with the remaining ms (1000 - 100 = 900)
    const setTimeoutCalls = sleepSpy.mock.calls.filter(
      ([fn, ms]) => typeof fn === 'function' && typeof ms === 'number' && ms > 0
    );
    expect(setTimeoutCalls.length).toBeGreaterThanOrEqual(1);
    const sleepDuration = setTimeoutCalls[setTimeoutCalls.length - 1][1] as number;
    expect(sleepDuration).toBeGreaterThanOrEqual(899);
    expect(sleepDuration).toBeLessThanOrEqual(901);

    // Advance fake timers to let the sleep resolve
    await vi.advanceTimersByTimeAsync(1000);
    await secondPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
