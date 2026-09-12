import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareProvider } from '../../src/providers/CloudflareProvider';
import { ProviderRequest } from '../../src/types';

describe('CloudflareProvider', () => {
  const DAILY_LIMIT = 10000;
  const TEST_ACCOUNT_ID = 'test-account-id-123';
  let provider: CloudflareProvider;

  beforeEach(() => {
    provider = new CloudflareProvider('test-api-key', TEST_ACCOUNT_ID);
    vi.stubGlobal('fetch', vi.fn());
    // URL.createObjectURL is a web API not available in Node.js; stub it for image provider tests
    (URL as any).createObjectURL = vi.fn(() => 'blob:test-image-url');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (URL as any).createObjectURL;
  });

  it('should have correct name and category', () => {
    expect(provider.name).toBe('cloudflare');
    expect(provider.category).toBe('image');
  });

  it('should have quota initialized with daily limit of 10000', () => {
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
      prompt: 'A mountain landscape',
      taskType: 'image',
    };

    const response = await provider.route(request);

    expect(response.content).toBe('Image generated: blob:test-image-url');
    expect(response.provider).toBe('cloudflare');
    expect(response.tokensUsed).toBe(1);
    expect(response.model).toBe('@cf/stabilityai/stable-diffusion-xl-base-1.0');
  });

  it('should send image parameters in request body', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    const request: ProviderRequest = {
      prompt: 'A mountain landscape',
      taskType: 'image',
      image: {
        prompt: 'A mountain landscape',
        negativePrompt: 'dark, scary',
        width: 1024,
        height: 768,
      },
    };

    await provider.route(request);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/@cf/stabilityai/stable-diffusion-xl-base-1.0'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          prompt: 'A mountain landscape',
          negative_prompt: 'dark, scary',
          width: 1024,
          height: 768,
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

    await provider.route({ prompt: 'A landscape', taskType: 'image' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          prompt: 'A landscape',
          negative_prompt: '',
          width: 512,
          height: 512,
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

    await provider.route({ prompt: 'A landscape', taskType: 'image' });

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

    await provider.route({ prompt: 'A landscape', taskType: 'image' });

    expect(provider.quota.remaining).toBe(0);
    expect(provider.quota.available).toBe(false);
  });

  it('should throw error when quota is exhausted', async () => {
    provider.quota.available = false;

    await expect(provider.route({ prompt: 'A landscape', taskType: 'image' }))
      .rejects.toThrow('Cloudflare quota exhausted');
  });

  it('should throw error on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);

    await expect(provider.route({ prompt: 'A landscape', taskType: 'image' }))
      .rejects.toThrow('Cloudflare API error: 403');
  });

  it('should send correct API request format with Authorization header and account ID in URL', async () => {
    const mockBlob = new Blob(['image-data'], { type: 'image/png' });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    } as unknown as Response);

    await provider.route({ prompt: 'Test', taskType: 'image' });

    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should perform health check successfully with account ID in URL', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
    } as Response);

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/models/search`,
      expect.objectContaining({
        headers: {
          'Authorization': 'Bearer test-api-key',
        },
      })
    );
  });

  it('should handle health check failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(false);
  });
});
