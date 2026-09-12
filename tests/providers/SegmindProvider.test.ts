import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SegmindProvider } from '../../src/providers/SegmindProvider';
import { ProviderRequest } from '../../src/types';

describe('SegmindProvider', () => {
  const DAILY_LIMIT = 100;
  let provider: SegmindProvider;

  beforeEach(() => {
    provider = new SegmindProvider('test-api-key');
    vi.stubGlobal('fetch', vi.fn());
    // URL.createObjectURL is a web API not available in Node.js; stub it for image provider tests
    (URL as any).createObjectURL = vi.fn(() => 'blob:test-image-url');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('segmind');
    expect(provider.category).toBe('image');
  });

  it('should have quota initialized with daily limit of 100', () => {
    expect(provider.quota.total).toBe(DAILY_LIMIT);
    expect(provider.quota.remaining).toBe(DAILY_LIMIT);
    expect(provider.quota.resetWindow).toBe('daily');
    expect(provider.quota.available).toBe(true);
  });

  it('should route image request successfully', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    const request: ProviderRequest = {
      prompt: 'A cat in a hat',
      taskType: 'image',
    };

    const response = await provider.route(request);

    expect(response.content).toBe('Image generated: blob:test-image-url');
    expect(response.provider).toBe('segmind');
    expect(response.tokensUsed).toBe(1);
    expect(response.model).toBe('sd-xl-turbo');
  });

  it('should send image parameters in request body', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    const request: ProviderRequest = {
      prompt: 'A cat in a hat',
      taskType: 'image',
      image: {
        prompt: 'A cat in a hat',
        negativePrompt: 'blurry',
        width: 1024,
        height: 768,
      },
    };

    await provider.route(request);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/sd-xl-turbo'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A cat in a hat',
          negative_prompt: 'blurry',
          width: 1024,
          height: 768,
          samples: 1,
        }),
      })
    );
  });

  it('should use default image dimensions when not provided', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    await provider.route({ prompt: 'A cat', taskType: 'image' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          prompt: 'A cat',
          negative_prompt: '',
          width: 512,
          height: 512,
          samples: 1,
        }),
      })
    );
  });

  it('should decrement quota by 1 after successful image generation', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    await provider.route({ prompt: 'A cat', taskType: 'image' });

    expect(provider.quota.remaining).toBe(DAILY_LIMIT - 1);
    expect(provider.quota.available).toBe(true);
  });

  it('should disable quota when remaining hits zero', async () => {
    provider.quota.remaining = 1;

    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    await provider.route({ prompt: 'A cat', taskType: 'image' });

    expect(provider.quota.remaining).toBe(0);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw error when quota is exhausted', async () => {
    provider.quota.available = false;

    await expect(provider.route({ prompt: 'A cat', taskType: 'image' }))
      .rejects.toThrow('Segmind quota exhausted');
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(provider.route({ prompt: 'A cat', taskType: 'image' }))
      .rejects.toThrow('Segmind API error: 401');
  });

  it('should send correct API request format with x-api-key header', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    await provider.route({ prompt: 'Test', taskType: 'image' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.segmind.com/v1/sd-xl-turbo',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-api-key': 'test-api-key',
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
