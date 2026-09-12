import { describe, it, expect, beforeEach } from 'vitest';
import { Deduplicator } from '../../src/compression/Deduplicator';

describe('Deduplicator', () => {
  let deduplicator: Deduplicator;

  beforeEach(() => {
    deduplicator = new Deduplicator();
  });

  // --- Core behavior ---

  it('should identify repeated blocks and replace with DEDUP reference', () => {
    const sharedBlock = 'Here is the code: function hello() { return "world"; } and it does something useful.';
    const messages = [
      { role: 'user' as const, content: sharedBlock },
      { role: 'assistant' as const, content: 'I see the code.' },
      { role: 'user' as const, content: sharedBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated).toHaveLength(3);
    expect(result.deduplicated[2].content).toContain('[DEDUP:');
    expect(result.stats.deduplication).toBeGreaterThan(0);
  });

  it('should preserve first occurrence of a repeated block', () => {
    const block = 'This is a long repeated block that exceeds the minimum deduplication threshold size.';
    const messages = [
      { role: 'user' as const, content: block },
      { role: 'assistant' as const, content: 'Acknowledged.' },
      { role: 'user' as const, content: block }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[0].content).toBe(block);
    expect(result.deduplicated[2].content).toContain('[DEDUP:');
    expect(result.deduplicated[2].content).not.toBe(block);
  });

  // --- Short block threshold ---

  it('should not deduplicate blocks shorter than minimum threshold', () => {
    const messages = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'user' as const, content: 'Hi' }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[1].content).toBe('Hi');
    expect(result.stats.deduplication).toBe(0);
  });

  it('should not deduplicate exactly 49-char blocks', () => {
    const shortBlock = 'A'.repeat(49);
    const messages = [
      { role: 'user' as const, content: shortBlock },
      { role: 'user' as const, content: shortBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[1].content).toBe(shortBlock);
    expect(result.stats.deduplication).toBe(0);
  });

  it('should deduplicate blocks at exactly 50 characters', () => {
    const exactBlock = 'B'.repeat(50);
    const messages = [
      { role: 'user' as const, content: exactBlock },
      { role: 'user' as const, content: exactBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[1].content).toContain('[DEDUP:');
    expect(result.stats.deduplication).toBeGreaterThan(0);
  });

  // --- Edge cases ---

  it('should handle empty messages array', () => {
    const result = deduplicator.compress([]);

    expect(result.deduplicated).toHaveLength(0);
    expect(result.stats.deduplication).toBe(0);
    expect(result.references.size).toBe(0);
  });

  it('should handle single message with no repetition', () => {
    const messages = [
      { role: 'user' as const, content: 'A unique message that is definitely long enough to pass the threshold.' }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated).toHaveLength(1);
    expect(result.deduplicated[0].content).toBe(messages[0].content);
    expect(result.stats.deduplication).toBe(0);
  });

  it('should not deduplicate across different content', () => {
    const messages = [
      { role: 'user' as const, content: 'First distinct long message that exceeds the minimum size for deduplication logic.' },
      { role: 'user' as const, content: 'Second distinct long message that also exceeds the minimum size for deduplication logic.' }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[0].content).toBe(messages[0].content);
    expect(result.deduplicated[1].content).toBe(messages[1].content);
    expect(result.stats.deduplication).toBe(0);
  });

  it('should handle multiple different repeated blocks', () => {
    const blockA = 'First repeated block content that is definitely long enough for the deduplication algorithm to process.';
    const blockB = 'Second repeated block content that is also long enough for the deduplication algorithm to process.';
    const messages = [
      { role: 'user' as const, content: `${blockA}\n\n${blockB}` },
      { role: 'assistant' as const, content: 'Ok.' },
      { role: 'user' as const, content: `${blockA}\n\n${blockB}` }
    ];

    const result = deduplicator.compress(messages);

    expect(result.stats.deduplication).toBeGreaterThan(0);
    expect(result.deduplicated[2].content).toContain('[DEDUP:');
  });

  it('should handle messages with code blocks', () => {
    const codeBlock = '```typescript\nfunction processData(input: string): string {\n  return input.toUpperCase();\n}\n```';
    const messages = [
      { role: 'user' as const, content: codeBlock },
      { role: 'assistant' as const, content: 'Got it.' },
      { role: 'user' as const, content: codeBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[2].content).toContain('[DEDUP:');
    expect(result.stats.deduplication).toBeGreaterThan(0);
  });

  it('should preserve message roles after compression', () => {
    const longBlock = 'This is a sufficiently long block of text to trigger deduplication in the compression layer.';
    const messages = [
      { role: 'user' as const, content: longBlock },
      { role: 'assistant' as const, content: 'Acknowledged.' },
      { role: 'user' as const, content: longBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[0].role).toBe('user');
    expect(result.deduplicated[1].role).toBe('assistant');
    expect(result.deduplicated[2].role).toBe('user');
  });

  it('should populate references map with deduplication entries', () => {
    const block = 'A long enough repeated block that should be deduplicated by the compression layer.';
    const messages = [
      { role: 'user' as const, content: block },
      { role: 'assistant' as const, content: 'Noted.' },
      { role: 'user' as const, content: block }
    ];

    const result = deduplicator.compress(messages);

    expect(result.references.size).toBeGreaterThan(0);
  });

  it('should handle system messages without affecting deduplication', () => {
    const longBlock = 'Repeated system-level context that is long enough to be deduplicated by the compressor.';
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: longBlock },
      { role: 'assistant' as const, content: 'Ready.' },
      { role: 'user' as const, content: longBlock }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[0].content).toBe('You are a helpful assistant.');
    expect(result.deduplicated[3].content).toContain('[DEDUP:');
  });

  it('should handle triple repetition (first kept, second and third deduplicated)', () => {
    const block = 'Triple repeated block content that exceeds the minimum threshold for deduplication processing.';
    const messages = [
      { role: 'user' as const, content: block },
      { role: 'user' as const, content: block },
      { role: 'user' as const, content: block }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[0].content).toBe(block);
    expect(result.deduplicated[1].content).toContain('[DEDUP:');
    expect(result.deduplicated[2].content).toContain('[DEDUP:');
    expect(result.stats.deduplication).toBeGreaterThan(0);
  });

  it('should deduplicate repeated paragraphs while preserving unique paragraphs', () => {
    const repeatedParagraph = 'This repeated section is long enough to be deduplicated by the compression algorithm.';
    const messages = [
      { role: 'user' as const, content: `First context paragraph.\n\n${repeatedParagraph}` },
      { role: 'assistant' as const, content: 'Understood.' },
      { role: 'user' as const, content: `Second context paragraph.\n\n${repeatedParagraph}` }
    ];

    const result = deduplicator.compress(messages);

    expect(result.deduplicated[2].content).toContain('[DEDUP:');
    expect(result.deduplicated[2].content).toContain('Second context paragraph.');
    expect(result.stats.deduplication).toBeGreaterThan(0);
  });

  it('should produce deterministic hashes for identical content', () => {
    const block = 'Deterministic hash test content that is long enough for consistent deduplication results.';
    const messages1 = [
      { role: 'user' as const, content: block },
      { role: 'user' as const, content: block }
    ];
    const messages2 = [
      { role: 'user' as const, content: block },
      { role: 'user' as const, content: block }
    ];

    const result1 = deduplicator.compress(messages1);
    const deduplicator2 = new Deduplicator();
    const result2 = deduplicator2.compress(messages2);

    const refs1 = Array.from(result1.references.keys());
    const refs2 = Array.from(result2.references.keys());
    expect(refs1).toEqual(refs2);
  });

  it('should produce valid SHA-256 truncated hashes in DEDUP tags', () => {
    const block = 'Hash validation test content that ensures the deduplication tag contains valid hex characters.';
    const messages = [
      { role: 'user' as const, content: block },
      { role: 'user' as const, content: block }
    ];

    const result = deduplicator.compress(messages);

    const dedupMatch = result.deduplicated[1].content.match(/\[DEDUP:([a-f0-9]{8})\]/);
    expect(dedupMatch).not.toBeNull();
    expect(dedupMatch![1]).toHaveLength(8);
  });

  it('should calculate meaningful token savings in stats', () => {
    const block = 'Token savings calculation test with sufficiently long content to produce a measurable difference in output size.';
    const messages = [
      { role: 'user' as const, content: block },
      { role: 'assistant' as const, content: 'Processing.' },
      { role: 'user' as const, content: block }
    ];

    const result = deduplicator.compress(messages);

    const expectedMinSavings = Math.ceil(block.length / 4) - Math.ceil('[DEDUP:aaaaaaaa]'.length / 4);
    expect(result.stats.deduplication).toBeGreaterThanOrEqual(expectedMinSavings);
  });
});
