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
});
