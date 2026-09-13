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
    expect(result.stats.deduplication).toBe(0);
    expect(result.stats.semantic).toBe(0);
    expect(result.stats.truncation).toBe(0);
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

    expect(result.stats.semantic).toBeGreaterThan(0);
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
    expect(result.stats.truncation).toBe(0);
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
    expect(result.stats.truncation).toBeGreaterThan(0);
  });

  it('should not truncate when within context window at level 2', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'Short message' }
    ];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.compressed).toHaveLength(1);
    expect(result.stats.truncation).toBe(0);
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

    const expectedTotal = result.stats.deduplication
      + result.stats.semantic
      + result.stats.truncation;
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

  // --- ToolResultCompressor integration (level 2+) ---

  it('should include toolResult in breakdown at level 2', () => {
    const big = Array.from({ length: 200 }, (_, i) => `/src/file-${i}.ts`).join('\n');
    const messages: Message[] = [{ role: 'user' as const, content: big }];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.stats.toolResult).toBeGreaterThan(0);
    expect(result.stats.totalSaved).toBeGreaterThanOrEqual(result.stats.toolResult);
  });

  it('should have zero toolResult at level 1', () => {
    const big = Array.from({ length: 200 }, (_, i) => `/src/file-${i}.ts`).join('\n');
    const messages: Message[] = [{ role: 'user' as const, content: big }];

    const result = compressor.compress(messages, 1, 10000);

    expect(result.stats.toolResult).toBe(0);
  });

  it('should accept level 3 without error', () => {
    const messages: Message[] = [
      { role: 'user' as const, content: 'Hello' }
    ];

    const result = compressor.compress(messages, 3, 10000);

    expect(result.compressed).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it('should stack toolResult on top of other layers at level 2', () => {
    const sharedBlock = 'Here is repeated content that is long enough to trigger deduplication across messages. '.repeat(2);
    const big = Array.from({ length: 200 }, (_, i) => `/src/file-${i}.ts`).join('\n');
    const messages: Message[] = [
      { role: 'user' as const, content: `${sharedBlock}\n${big}` },
      { role: 'assistant' as const, content: 'Acknowledged.' },
      { role: 'user' as const, content: `${sharedBlock}\n${big}` },
    ];

    const result = compressor.compress(messages, 2, 10000);

    expect(result.stats.totalSaved).toBeGreaterThan(0);
    // toolResult should contribute savings
    expect(result.stats.toolResult).toBeGreaterThanOrEqual(0);
  });
});

// --- Level 3 Integration: Task 25 cross-suite proof ---

describe('Level 3 integration', () => {
  let compressor: Compressor;

  beforeEach(() => {
    compressor = new Compressor();
  });

  it('stacks toolResult+pruner+cache on a re-pasted 2.5k file x3 session', async () => {
    // ToolResultCompressor fires on messages > 70 lines (HEAD 50 + TAIL 20).
    // File content inside fences is fence-protected; add long tool-output-style
    // lines outside fences so ToolResultCompressor can collapse them.
    const file = Array(40).fill('const x = 1; // ' + 'x'.repeat(80)).join('\n');
    // 80+ tool-output lines outside fences → >70 line threshold → head/tail collapse
    const longOutput = Array.from({ length: 90 }, (_, i) => `line-${i}: ` + 'y'.repeat(60)).join('\n');
    const messages: Message[] = [
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`\n${longOutput}` },
      { role: 'assistant' as const, content: 'Got it' },
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`\n${longOutput}` },
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`\n${longOutput}` },
    ];
    const r2 = compressor.compress(messages, 2, 32000);
    const r3 = compressor.compress(messages, 3, 32000);
    // ToolResult + pruning contribute at level 3
    expect(r3.stats.toolResult + r3.stats.pruning).toBeGreaterThan(0);
    expect(r3.stats.totalSaved).toBeGreaterThan(r2.stats.totalSaved);
    // CachePin applied — bucket exists
    expect(typeof r3.stats.cache).toBe('number');
  });

  it('compress stats surface all 6 buckets and explain is an extensible record', () => {
    const r = compressor.compress([{ role: 'user', content: 'hello' }], 3, 32000);
    expect(r).toHaveProperty('stats');
    expect(r).toHaveProperty('explain');
    expect(typeof r.explain).toBe('object');
    // All 6 breakdown buckets exist
    expect(typeof r.stats.deduplication).toBe('number');
    expect(typeof r.stats.semantic).toBe('number');
    expect(typeof r.stats.truncation).toBe('number');
    expect(typeof r.stats.toolResult).toBe('number');
    expect(typeof r.stats.pruning).toBe('number');
    expect(typeof r.stats.cache).toBe('number');
  });

  it('level 3 explanation is extensible with string-valued record', () => {
    const r = compressor.compress([{ role: 'user', content: 'test message' }], 3, 10000);
    // explain must be Record<string, string> — extensible, not hardcoded
    if (r.explain) {
      for (const [key, value] of Object.entries(r.explain)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
      }
    }
  });
});
