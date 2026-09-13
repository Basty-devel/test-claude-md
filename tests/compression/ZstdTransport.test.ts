import { describe, it, expect } from 'vitest';
import { ZstdTransport } from '../../src/compression/ZstdTransport';
import { Message } from '../../src/types';

const t = new ZstdTransport();

describe('ZstdTransport', () => {
  it('does not compress when disabled', () => {
    const msgs: Message[] = [{ role: 'user', content: 'Hello world!'.repeat(2000) }];
    const res = t.compress(msgs, false);
    expect(res.transportCompressed).toBe(false);
    expect(res.compressed).toHaveLength(1);
    expect(res.compressed[0].content).not.toContain('__ZSTD__:');
  });

  it('does not compress small payloads even when enabled', () => {
    const msgs: Message[] = [{ role: 'user', content: 'Short hello' }];
    const res = t.compress(msgs, true);
    expect(res.transportCompressed).toBe(false);
    expect(res.compressed).toHaveLength(1);
    expect(res.originalBytes).toBeGreaterThan(0);
  });

  it('compresses large repetitive payloads and round-trips', () => {
    const large = 'hello hello hello '.repeat(4_000); // ~72k chars -> >40k bytes
    const msgs: Message[] = [{ role: 'user', content: large }];
    const res = t.compress(msgs, true);
    expect(res.transportCompressed).toBe(true);
    expect(res.compressed).toHaveLength(1);
    expect(res.compressed[0].content.startsWith('__ZSTD__:')).toBe(true);
    expect(res.compressedBytes).toBeLessThan(res.originalBytes);
    expect(res.ratio).toBeLessThan(0.5);

    const decompressed = t.decompress(res.compressed[0].content);
    expect(decompressed).not.toBeNull();
    // decompress returns the joined messages (role: content format)
    expect(decompressed).toContain('hello hello');
  });

  it('decompress returns null for non-Zstd content', () => {
    expect(t.decompress('plain text')).toBeNull();
    expect(t.decompress(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('round-trip is lossless for code-like payloads above threshold', () => {
    const code = 'function hello() { return "world"; }\n'.repeat(1_500);
    const msgs: Message[] = [{ role: 'user', content: code }];
    const { compressed } = t.compress(msgs, true);
    expect(compressed[0].content.startsWith('__ZSTD__:')).toBe(true);
    const decompressed = t.decompress(compressed[0].content)!;
    expect(decompressed).toBe(`user: ${code}`);
  });
});
