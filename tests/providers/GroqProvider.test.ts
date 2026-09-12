import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider } from '../../src/providers/GroqProvider';
import { ProviderRequest } from '../../src/types';

describe('GroqProvider', () => {
  const DAILY_LIMIT = 14000;
  let provider: GroqProvider;

  beforeEach(() => {
    provider = new GroqProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('groq');
    expect(provider.category).toBe('chat');
  });

  it('should have quota initialized', () => {
    expect(provider.quota.total).toBe(14000);
    expect(provider.quota.remaining).toBe(14000);
    expect(provider.quota.resetWindow).toBe('daily');
  });

  it('should route chat request successfully', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
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

    expect(response.content).toBe('Hello!');
    expect(response.provider).toBe('groq');
    expect(response.tokensUsed).toBe(15);
  });

  it('should throw Groq quota exhausted when quota is not available', async () => {
    provider.quota.available = false;

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('Groq quota exhausted');
  });

  it('should decrement quota remaining by tokens used after successful route', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await provider.route(request);

    expect(provider.quota.remaining).toBe(DAILY_LIMIT - 15);
  });

  it('should mark quota as unavailable when remaining reaches zero', async () => {
    provider.quota.remaining = 10;

    const mockResponse = {
      choices: [{ message: { content: 'Hello!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await provider.route(request);

    expect(provider.quota.remaining).toBeLessThanOrEqual(0);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw a contextual error when the response is missing usage data', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello!' } }],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('Groq API error: malformed response');
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

    await expect(provider.route(request)).rejects.toThrow('Groq API error: 429');
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
