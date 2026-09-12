import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TogetherProvider } from '../../src/providers/TogetherProvider';
import { ProviderRequest } from '../../src/types';

describe('TogetherProvider', () => {
  let provider: TogetherProvider;

  beforeEach(() => {
    provider = new TogetherProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('together');
    expect(provider.category).toBe('code');
  });

  it('should have quota initialized with hourly window', () => {
    expect(provider.quota.total).toBe(1000);
    expect(provider.quota.remaining).toBe(1000);
    expect(provider.quota.resetWindow).toBe('hourly');
    expect(provider.quota.available).toBe(true);
  });

  it('should route code request successfully', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'def hello(): pass' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Write a hello function',
      taskType: 'code',
    };

    const response = await provider.route(request);

    expect(response.content).toBe('def hello(): pass');
    expect(response.provider).toBe('together');
    expect(response.tokensUsed).toBe(15);
    expect(response.model).toBe('codellama/codellama-34b-instruct');
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Rate limited',
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'code',
    };

    await expect(provider.route(request)).rejects.toThrow('Together API error: 429');
  });

  it('should decrement quota after successful route', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'code' });

    expect(provider.quota.remaining).toBe(700);
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

    await provider.route({ prompt: 'Big request', taskType: 'code' });

    expect(provider.quota.remaining).toBe(0);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw error when quota is exhausted', async () => {
    provider.quota.available = false;

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'code',
    };

    await expect(provider.route(request)).rejects.toThrow('Together quota exhausted');
  });

  it('should throw error when rate limit is exceeded', async () => {
    // Exhaust rate limit counter
    (provider as any).requestCount = 20;

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'code',
    };

    await expect(provider.route(request)).rejects.toThrow('Together rate limit exceeded');
  });

  it('should throw error on malformed response missing usage data', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await expect(
      provider.route({ prompt: 'Test', taskType: 'code' })
    ).rejects.toThrow('Together API error: malformed response (missing usage data)');
  });

  it('should throw error on malformed response with invalid usage types', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 'not-a-number', completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await expect(
      provider.route({ prompt: 'Test', taskType: 'code' })
    ).rejects.toThrow('Together API error: malformed response (missing usage data)');
  });

  it('should reset rate limit window after 60 seconds', async () => {
    // Set rate limit counter at max and window start 61 seconds ago
    (provider as any).requestCount = 20;
    (provider as any).windowStart = Date.now() - 61000;

    const mockResponse = {
      choices: [{ message: { content: 'OK' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const response = await provider.route({ prompt: 'Test', taskType: 'code' });

    expect(response.content).toBe('OK');
    expect(response.provider).toBe('together');
  });

  it('should send correct API request format', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test prompt', taskType: 'code' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.together.xyz/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      })
    );
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
});
