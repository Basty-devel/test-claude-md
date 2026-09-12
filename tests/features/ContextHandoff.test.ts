import { describe, it, expect, beforeEach } from 'vitest';
import { ContextHandoff } from '../../src/features/ContextHandoff';

describe('ContextHandoff', () => {
  let handoff: ContextHandoff;

  beforeEach(() => {
    handoff = new ContextHandoff();
  });

  it('should create compact handoff payload', () => {
    const messages = [
      { role: 'user' as const, content: 'First message' },
      { role: 'assistant' as const, content: 'First response' },
      { role: 'user' as const, content: 'Second message' },
      { role: 'assistant' as const, content: 'Second response' }
    ];

    const codeBlocks = [
      { language: 'typescript', code: 'const x = 1;', filename: 'test.ts' }
    ];

    const payload = handoff.create(messages, codeBlocks, ['test.ts'], ['Used TypeScript']);

    expect(payload.recentTurns).toHaveLength(2);
    expect(payload.codeSnippets).toHaveLength(1);
    expect(payload.activeFiles).toContain('test.ts');
  });

  it('should limit summary length', () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}: ${'x'.repeat(200)}`
    }));

    const payload = handoff.create(messages, [], [], []);

    expect(payload.summary.length).toBeLessThan(5000);
  });
});
