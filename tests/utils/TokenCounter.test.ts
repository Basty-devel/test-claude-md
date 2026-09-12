import { describe, it, expect } from 'vitest';
import { TokenCounter } from '../../src/utils/TokenCounter';

describe('TokenCounter', () => {
  it('should estimate tokens for simple text', () => {
    const text = 'Hello world';
    const tokens = TokenCounter.estimate(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  it('should handle empty string', () => {
    const tokens = TokenCounter.estimate('');
    expect(tokens).toBe(0);
  });

  it('should handle code blocks', () => {
    const code = 'function hello() {\n  return "world";\n}';
    const tokens = TokenCounter.estimate(code);
    expect(tokens).toBeGreaterThan(5);
  });

  it('should count actual tokens from API response', () => {
    const usage = { prompt_tokens: 100, completion_tokens: 50 };
    const count = TokenCounter.fromUsage(usage);
    expect(count).toBe(150);
  });

  it('should return 0 for countMessages with empty array', () => {
    const count = TokenCounter.countMessages([]);
    expect(count).toBe(0);
  });

  it('should sum tokens across multiple messages', () => {
    const messages = [
      { content: 'Hello' },       // 5 chars => ceil(5/4) = 2
      { content: 'World' },       // 5 chars => ceil(5/4) = 2
      { content: 'Test message' } // 12 chars => ceil(12/4) = 3
    ];
    const count = TokenCounter.countMessages(messages);
    expect(count).toBe(7);
  });
});
