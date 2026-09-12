import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekProvider } from '../../src/providers/DeepSeekProvider';
import { ProviderRequest } from '../../src/types';

describe('DeepSeekProvider', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    provider = new DeepSeekProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('deepseek');
    expect(provider.category).toBe('chat');
  });

  it('should have quota initialized', () => {
    expect(provider.quota.total).toBe(5000);
    expect(provider.quota.remaining).toBe(5000);
    expect(provider.quota.resetWindow).toBe('daily');
    expect(provider.quota.available).toBe(true);
  });

  it('should route chat request successfully', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from DeepSeek!' } }],
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

    expect(response.content).toBe('Hello from DeepSeek!');
    expect(response.provider).toBe('deepseek');
    expect(response.tokensUsed).toBe(15);
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('DeepSeek API error: 401');
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
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'chat' });

    expect(provider.quota.remaining).toBe(5000 - 300);
    expect(provider.quota.available).toBe(true);
  });

  it('should disable quota when remaining hits zero', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Response' } }],
      usage: { prompt_tokens: 2500, completion_tokens: 2500 },
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

    await expect(provider.route(request)).rejects.toThrow('DeepSeek quota exhausted');
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
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      })
    );
  });
});