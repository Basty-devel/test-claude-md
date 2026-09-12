import { describe, it, expect, beforeEach } from 'vitest';
import { SmartTruncator } from '../../src/compression/SmartTruncator';

describe('SmartTruncator', () => {
  let truncator: SmartTruncator;

  beforeEach(() => {
    truncator = new SmartTruncator();
  });

  it('should keep system prompt and last 3 turns when messages exceed context window', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'A'.repeat(400) },
      { role: 'assistant' as const, content: 'B'.repeat(400) },
      { role: 'user' as const, content: 'C'.repeat(400) },
      { role: 'assistant' as const, content: 'D'.repeat(400) },
      { role: 'user' as const, content: 'E'.repeat(400) },
      { role: 'assistant' as const, content: 'F'.repeat(400) },
      { role: 'user' as const, content: 'G'.repeat(400) },
      { role: 'assistant' as const, content: 'H'.repeat(400) },
      { role: 'user' as const, content: 'I'.repeat(400) }
    ];

    const result = truncator.truncate(messages, 50);

    expect(result.truncated[0].role).toBe('system');
    expect(result.truncated.length).toBeLessThan(messages.length);
    expect(result.truncated[result.truncated.length - 1].content).toBe('I'.repeat(400));
  });

  it('should preserve code blocks verbatim in truncated output', () => {
    const messages = [
      { role: 'user' as const, content: 'Fix this:\n```typescript\nfunction broken() {\n  return null;\n}\n```' },
      { role: 'assistant' as const, content: 'Here is the fix' },
      { role: 'user' as const, content: 'Thanks' }
    ];

    const result = truncator.truncate(messages, 10);

    expect(result.truncated[0].content).toContain('function broken()');
  });

  it('should not truncate messages already within the token budget', () => {
    const messages = [
      { role: 'user' as const, content: 'Short message' }
    ];

    const result = truncator.truncate(messages, 10000);

    expect(result.truncated).toHaveLength(1);
    expect(result.stats.truncation).toBe(0);
  });

  it('should return empty truncated array for empty messages input', () => {
    const result = truncator.truncate([], 1000);

    expect(result.truncated).toHaveLength(0);
    expect(result.stats.truncation).toBe(0);
  });

  it('should keep all messages when count is less than or equal to last turns budget', () => {
    const messages = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' }
    ];

    const result = truncator.truncate(messages, 10);

    expect(result.truncated).toHaveLength(3);
  });

  it('should return system message alone when context window is extremely small', () => {
    const messages = [
      { role: 'system' as const, content: 'You are helpful.' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' }
    ];

    const result = truncator.truncate(messages, 1);

    expect(result.truncated[0].role).toBe('system');
    expect(result.truncated.length).toBeGreaterThanOrEqual(1);
  });

  it('should preserve code blocks verbatim in summarized middle', () => {
    const messages = [
      { role: 'user' as const, content: 'Debug this code:\n```typescript\nfunction broken() {\n  return null;\n}\n```\nPlease fix it' },
      { role: 'assistant' as const, content: 'Here is the fix' },
      { role: 'user' as const, content: 'Thanks' }
    ];

    const result = truncator.truncate(messages, 5);

    const summaryContent = result.truncated[0].content;
    expect(summaryContent).toContain('function broken()');
  });

  it('should report truncation stats with tokens saved', () => {
    const messages = [
      { role: 'system' as const, content: 'System' },
      { role: 'user' as const, content: 'A'.repeat(200) },
      { role: 'assistant' as const, content: 'B'.repeat(200) },
      { role: 'user' as const, content: 'C'.repeat(200) },
      { role: 'assistant' as const, content: 'D'.repeat(200) },
      { role: 'user' as const, content: 'E'.repeat(200) },
      { role: 'assistant' as const, content: 'F'.repeat(200) },
      { role: 'user' as const, content: 'G'.repeat(200) },
      { role: 'assistant' as const, content: 'H'.repeat(200) }
    ];

    const result = truncator.truncate(messages, 50);

    expect(result.stats.truncation).toBeGreaterThan(0);
  });

  it('should handle messages with no system prompt', () => {
    const messages = [
      { role: 'user' as const, content: 'Message 1' },
      { role: 'assistant' as const, content: 'Response 1' },
      { role: 'user' as const, content: 'Message 2' },
      { role: 'assistant' as const, content: 'Response 2' },
      { role: 'user' as const, content: 'Message 3' },
      { role: 'assistant' as const, content: 'Response 3' }
    ];

    const result = truncator.truncate(messages, 10);

    expect(result.truncated[0].role).not.toBe('system');
    expect(result.truncated.length).toBeLessThanOrEqual(messages.length);
  });
});
