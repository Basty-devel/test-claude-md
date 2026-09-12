import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticCompressor } from '../../src/compression/SemanticCompressor';

describe('SemanticCompressor', () => {
  let compressor: SemanticCompressor;

  beforeEach(() => {
    compressor = new SemanticCompressor();
  });

  it('should remove repeated conversational filler', () => {
    const messages = [
      { role: 'user' as const, content: 'How do I fix this bug?' },
      { role: 'assistant' as const, content: 'I understand your issue. Let me help you fix this bug. Here is the solution...' }
    ];

    const result = compressor.compress(messages);

    expect(result.compressed[1].content).not.toContain('I understand');
    expect(result.stats.semantic).toBeGreaterThan(0);
  });

  it('should strip tool output boilerplate', () => {
    const messages = [
      { role: 'user' as const, content: 'Run the test' },
      { role: 'assistant' as const, content: '```\n/path/to/file.ts\n/path/to/file.ts\nAll tests passed\n```' }
    ];

    const result = compressor.compress(messages);

    expect(result.compressed[1].content).not.toContain('/path/to/file.ts');
  });

  it('should preserve code blocks verbatim', () => {
    const messages = [
      { role: 'user' as const, content: 'Fix this code:\n```typescript\nfunction broken() {\n  return null;\n}\n```' }
    ];

    const result = compressor.compress(messages);

    expect(result.compressed[0].content).toContain('function broken()');
  });
});
