import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../../src/providers/GeminiProvider';
import { ProviderRequest } from '../../src/types';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('gemini');
    expect(provider.category).toBe('chat');
  });

  it('should have quota initialized', () => {
    expect(provider.quota.total).toBe(1500);
    expect(provider.quota.remaining).toBe(1500);
    expect(provider.quota.resetWindow).toBe('daily');
    expect(provider.quota.available).toBe(true);
  });

  it('should route chat request successfully', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
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

    expect(response.content).toBe('Hello from Gemini!');
    expect(response.provider).toBe('gemini');
    expect(response.tokensUsed).toBe(15);
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Hello',
      taskType: 'chat',
    };

    await expect(provider.route(request)).rejects.toThrow('Gemini API error: 500');
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
      candidates: [{ content: { parts: [{ text: 'Response' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'chat' });

    expect(provider.quota.remaining).toBe(1500 - 30);
    expect(provider.quota.available).toBe(true);
  });

  it('should disable quota when remaining hits zero', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'Response' }] } }],
      usageMetadata: { promptTokenCount: 750, candidatesTokenCount: 750 },
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

    await expect(provider.route(request)).rejects.toThrow('Gemini quota exhausted');
  });

  it('should send correct API request format', async () => {
    const mockResponse = {
      candidates: [{ content: { parts: [{ text: 'Response' }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test prompt', taskType: 'chat' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com/v1beta/models'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
});
