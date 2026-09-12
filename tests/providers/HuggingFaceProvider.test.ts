import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HuggingFaceProvider } from '../../src/providers/HuggingFaceProvider';
import { ProviderRequest } from '../../src/types';

describe('HuggingFaceProvider', () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    provider = new HuggingFaceProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('huggingface');
    expect(provider.category).toBe('code');
  });

  it('should have quota initialized with daily window', () => {
    expect(provider.quota.total).toBe(500);
    expect(provider.quota.remaining).toBe(500);
    expect(provider.quota.resetWindow).toBe('daily');
    expect(provider.quota.available).toBe(true);
  });

  it('should route code request successfully with array response', async () => {
    const mockResponse = [{ generated_text: 'def hello(): pass' }];

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
    expect(response.provider).toBe('huggingface');
    expect(response.model).toBe('codellama/CodeLlama-34b-Instruct-hf');
  });

  it('should route code request successfully with object response', async () => {
    const mockResponse = { generated_text: 'function hello() {}' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const request: ProviderRequest = {
      prompt: 'Write a hello function',
      taskType: 'code',
    };

    const response = await provider.route(request);

    expect(response.content).toBe('function hello() {}');
    expect(response.provider).toBe('huggingface');
  });

  it('should use maxTokens from request when provided', async () => {
    const mockResponse = { generated_text: 'Response' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'code', maxTokens: 2048 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          inputs: 'Test',
          parameters: { max_new_tokens: 2048 },
        }),
      })
    );
  });

  it('should default maxTokens to 1024 when not provided', async () => {
    const mockResponse = { generated_text: 'Response' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'code' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          inputs: 'Test',
          parameters: { max_new_tokens: 1024 },
        }),
      })
    );
  });

  it('should decrement quota after successful route', async () => {
    const mockResponse = { generated_text: 'Response' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'code' });

    // 'Response' = 8 chars, estimateTokens = Math.ceil(8/4) = 2
    expect(provider.quota.remaining).toBe(500 - 2);
    expect(provider.quota.available).toBe(true);
  });

  it('should disable quota when remaining hits zero', async () => {
    // Set remaining to 1 so the next request depletes it
    provider.quota.remaining = 1;

    const mockResponse = { generated_text: 'Some response text here' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test', taskType: 'code' });

    // 'Some response text here' = 23 chars, estimateTokens = Math.ceil(23/4) = 6
    // 1 - 6 = -5
    expect(provider.quota.remaining).toBe(-5);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw error when quota is exhausted', async () => {
    provider.quota.available = false;

    await expect(provider.route({ prompt: 'Hello', taskType: 'code' }))
      .rejects.toThrow('HuggingFace quota exhausted');
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(provider.route({ prompt: 'Hello', taskType: 'code' }))
      .rejects.toThrow('HuggingFace API error: 401');
  });

  it('should send correct API request format', async () => {
    const mockResponse = { generated_text: 'Response' };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    await provider.route({ prompt: 'Test prompt', taskType: 'code' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-inference.huggingface.co/models/codellama/CodeLlama-34b-Instruct-hf',
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

  it('should return healthy when model is loading (503)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(true);
  });

  it('should handle health check failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(false);
  });

  it('should throw error on empty array response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as Response);

    await expect(
      provider.route({ prompt: 'Test', taskType: 'code' })
    ).rejects.toThrow('HuggingFace API error: malformed response');
  });

  it('should throw error on array response with missing generated_text', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{}]),
    } as Response);

    await expect(
      provider.route({ prompt: 'Test', taskType: 'code' })
    ).rejects.toThrow('HuggingFace API error: malformed response');
  });

  it('should throw error on object response with missing generated_text', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ other_field: 'value' }),
    } as Response);

    await expect(
      provider.route({ prompt: 'Test', taskType: 'code' })
    ).rejects.toThrow('HuggingFace API error: malformed response');
  });
});
