import { describe, it, expect, beforeEach } from 'vitest';
import { Compressor } from '../../src/compression/Compressor';
import { Message } from '../../src/types';

describe('Compressor', () => {
  let compressor: Compressor;

  beforeEach(() => {
    compressor = new Compressor();
  });

  // --- Level 0: No compression ---

  it('should return messages unchanged at level 0', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'Hello' }
    ];

    const result = compressor.compress(messages, 0, 10000);

    expect(result.compressed).toEqual(messages);
    expect(result.stats.totalSaved).toBe(0);
    expect(result.stats.percentage).toBe(0);
    expect(result.stats.breakdown.deduplication).toBe(0);
    expect(result.stats.breakdown.semantic).toBe(0);
    expect(result.stats.breakdown.truncation).toBe(0);
  });

  it('should return empty messages unchanged at level 0', () => {
    const result = compressor.compress([], 0, 10000);

    expect(result.compressed).toHaveLength(0);
    expect(result.stats.totalSaved).toBe(0);
  });

  // --- Level 1: Dedup + Semantic ---

  it('should apply deduplication and semantic compression at level 1', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'I understand your issue. Here is the code:\nfunction test() { return 1; }' },
      { role: 'assistant' as const, content: 'function test() { return 1; }' }
    ];

    const result = compressor.compress(messages, 1, 10000);

    expect(result.stats.totalSaved).toBeGreaterThan(0);
  });

  it('should strip filler phrases at level 1', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'How do I fix this?' },
      { role: 'assistant' as const, content: 'I understand your issue. Let me help you fix this. Here is the solution that will resolve everything.' }
    ];

    const result = compressor.compress(messages, 1, 10000);

    expect(result.stats.breakdown.semantic).toBeGreaterThan(0);
  });

  it('should not apply truncation at level 1', () => {
    const messages: Message[] = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'A'.repeat(400) },
      { role: 'assistant' as const, content: 'B'.repeat(400) },
      { role: 'user' as const, content: 'C'.repeat(400) },
      { role: 'assistant' as const, content: 'D'.repeat(400) },
      { role: 'user' as const, content: 'E'.repeat(400) },
      { role: 'assistant' as const, content: 'F'.repeat(400) },
      { role: 'user' as const, content: 'G'.repeat(400) },
      { role: 'assistant' as const, content: 'H'.repeat(400) }
    ];

    const result = compressor.compress(messages, 1, 50);

    expect(result.compressed).toHaveLength(messages.length);
    expect(result.stats.breakdown.truncation).toBe(0);
  });

  it('should return empty messages with zero stats at level 1', () => {
    const result = compressor.compress([], 1, 10000);

    expect(result.compressed).toHaveLength(0);
    expect(result.stats.totalSaved).toBe(0);
  });

  // --- Level 2: All layers (dedup + semantic + truncation) ---

  it('should apply all compression layers at level 2', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'I understand. '.repeat(100) },
      { role: 'assistant' as const, content: 'I understand. '.repeat(100) }
    ];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.stats.totalSaved).toBeGreaterThan(0);
  });

  it('should apply truncation at level 2 when exceeding context window', () => {
    const messages: Message[] = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'A'.repeat(400) },
      { role: 'assistant' as const, content: 'B'.repeat(400) },
      { role: 'user' as const, content: 'C'.repeat(400) },
      { role: 'assistant' as const, content: 'D'.repeat(400) },
      { role: 'user' as const, content: 'E'.repeat(400) },
      { role: 'assistant' as const, content: 'F'.repeat(400) },
      { role: 'user' as const, content: 'G'.repeat(400) },
      { role: 'assistant' as const, content: 'H'.repeat(400) }
    ];

    const result = compressor.compress(messages, 2, 50);

    expect(result.compressed.length).toBeLessThan(messages.length);
    expect(result.stats.breakdown.truncation).toBeGreaterThan(0);
  });

  it('should not truncate when within context window at level 2', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'Short message' }
    ];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.compressed).toHaveLength(1);
    expect(result.stats.breakdown.truncation).toBe(0);
  });

  it('should return empty messages with zero stats at level 2', () => {
    const result = compressor.compress([], 2, 10000);

    expect(result.compressed).toHaveLength(0);
    expect(result.stats.totalSaved).toBe(0);
  });

  // --- Stats correctness ---

  it('should compute totalSaved as sum of all breakdown values', () => {
    const repeatedBlock = 'A long enough repeated block for deduplication to work correctly here.';
    const messages: Message[] = [
      { role: 'user' as const, content: `I understand your issue. ${repeatedBlock}` },
      { role: 'assistant' as const, content: repeatedBlock },
      { role: 'user' as const, content: `Let me help you. ${repeatedBlock}` },
      { role: 'assistant' as const, content: repeatedBlock }
    ];

    const result = compressor.compress(messages, 2, 10000);

    const expectedTotal = result.stats.breakdown.deduplication
      + result.stats.breakdown.semantic
      + result.stats.breakdown.truncation;
    expect(result.stats.totalSaved).toBe(expectedTotal);
  });

  it('should compute percentage based on original token count', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'I understand your issue. Some content here that is reasonably long.' },
      { role: 'assistant' as const, content: 'I understand your issue. Some content here that is reasonably long.' }
    ];

    const result = compressor.compress(messages, 1, 10000);

    if (result.stats.totalSaved > 0) {
      expect(result.stats.percentage).toBeGreaterThan(0);
      expect(result.stats.percentage).toBeLessThanOrEqual(100);
    }
  });

  it('should return zero percentage when no tokens are saved', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'Hi' }
    ];

    const result = compressor.compress(messages, 1, 10000);

    expect(result.stats.percentage).toBe(0);
  });

  it('should return zero percentage for empty messages', () => {
    const result = compressor.compress([], 2, 10000);

    expect(result.stats.percentage).toBe(0);
  });

  // --- Level transitions ---

  it('should produce more compression at level 2 than level 1 for messages needing truncation', () => {
    const messages: Message[] = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'A'.repeat(400) },
      { role: 'assistant' as const, content: 'B'.repeat(400) },
      { role: 'user' as const, content: 'C'.repeat(400) },
      { role: 'assistant' as const, content: 'D'.repeat(400) },
      { role: 'user' as const, content: 'E'.repeat(400) },
      { role: 'assistant' as const, content: 'F'.repeat(400) },
      { role: 'user' as const, content: 'G'.repeat(400) },
      { role: 'assistant' as const, content: 'H'.repeat(400) }
    ];

    const resultLevel1 = compressor.compress(messages, 1, 50);
    const resultLevel2 = compressor.compress(messages, 2, 50);

    expect(resultLevel2.stats.totalSaved).toBeGreaterThanOrEqual(resultLevel1.stats.totalSaved);
  });

  it('should preserve message roles through compression', () => {
    const messages: Message[] = [
      { role: 'system' as const, content: 'You are helpful.' },
      { role: 'user' as const, content: 'Hello world' },
      { role: 'assistant' as const, content: 'Hi there' }
    ];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.compressed[0].role).toBe('system');
    expect(result.compressed[1].role).toBe('user');
    expect(result.compressed[2].role).toBe('assistant');
  });
});
