import { describe, it, expect, beforeEach } from 'vitest';
import { ToolResultCompressor } from '../../src/compression/ToolResultCompressor';
import { Message } from '../../src/types';

describe('ToolResultCompressor', () => {
  let compressor: ToolResultCompressor;

  beforeEach(() => {
    compressor = new ToolResultCompressor();
  });

  // --- Head/Tail Collapse ---

  it('collapses a 200-line directory listing to head/tail caps', () => {
    const big = Array.from({ length: 200 }, (_, i) => `/src/file-${i}.ts`).join('\n');
    const msgs: Message[] = [{ role: 'user', content: big }];
    const { compressed, stats } = compressor.compress(msgs);
    const lines = compressed[0].content.split('\n');
    expect(lines.length).toBeLessThan(90); // head 50 + tail 20 + 1 cap
    expect(compressed[0].content).toMatch(/\[… \d+ lines truncated …\]/);
    expect(stats.toolResult).toBeGreaterThan(0);
  });

  it('preserves head 50 and tail 20 lines exactly', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`);
    const big = lines.join('\n');
    const msgs: Message[] = [{ role: 'user', content: big }];
    const { compressed } = compressor.compress(msgs);
    const result = compressed[0].content;
    expect(result.startsWith('line-0')).toBe(true);
    expect(result.endsWith('line-99')).toBe(true);
    expect(result).toContain('line-49');
    expect(result).toContain('line-80');
    expect(result).not.toContain('line-50');
    expect(result).not.toContain('line-79');
  });

  it('does not collapse messages within head+tail threshold', () => {
    const short = Array.from({ length: 60 }, (_, i) => `line-${i}`).join('\n');
    const msgs: Message[] = [{ role: 'user', content: short }];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toBe(short);
    expect(stats.toolResult).toBe(0);
  });

  // --- Code Fence Protection ---

  it('never elides inside a ``` code fence', () => {
    const block = '```\n' + Array.from({ length: 120 }, (_, i) => `line-${i}`).join('\n') + '\n```';
    const msgs: Message[] = [{ role: 'user', content: block }];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toBe(block); // intact
    expect(stats.toolResult).toBe(0);
  });

  it('protects code fence in the middle and collapses non-fence parts', () => {
    const pre = Array.from({ length: 40 }, (_, i) => `pre-${i}`).join('\n');
    const fence = '```\n' + Array.from({ length: 30 }, (_, i) => `code-${i}`).join('\n') + '\n```';
    const post = Array.from({ length: 40 }, (_, i) => `post-${i}`).join('\n');
    const content = `${pre}\n${fence}\n${post}`;
    const msgs: Message[] = [{ role: 'user', content: content }];
    const { compressed } = compressor.compress(msgs);
    expect(compressed[0].content).toContain('code-0');
    expect(compressed[0].content).toContain('code-29');
  });

  // --- Diff Hunk Detection ---

  it('collapses diff context-only hunks while keeping changed hunks', () => {
    const contextHunk = Array.from({ length: 80 }, (_, i) => ` context-line-${i}`).join('\n');
    const changedHunk = '@@ -1,3 +1,4 @@\n+added line\n unchanged\n-removed\n+replacement';
    const content = `${contextHunk}\n${changedHunk}`;
    const msgs: Message[] = [{ role: 'user', content: content }];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toContain('@@ -1,3 +1,4 @@');
    expect(compressed[0].content).toContain('+added line');
    expect(stats.toolResult).toBeGreaterThan(0);
  });

  // --- Test/Lint Summary Detection ---

  it('collapses repeated pass lines in test summaries keeping headline and first failure', () => {
    const headline = 'Test Files  3 passed (3)';
    const failures = ' FAIL  src/foo.test.ts > should fail\n   Error: expected 1 to equal 2';
    const passes = Array.from({ length: 40 }, (_, i) => ` PASS  src/suite-${i}.test.ts`).join('\n');
    const content = `${headline}\n${failures}\n${passes}`;
    const msgs: Message[] = [{ role: 'user', content: content }];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toContain('Test Files');
    expect(compressed[0].content).toContain('FAIL');
    expect(compressed[0].content).toContain('Error: expected 1 to equal 2');
    expect(stats.toolResult).toBeGreaterThan(0);
  });

  // --- Generic Large Output Collapse ---

  it('collapses generic large outputs exceeding threshold', () => {
    const big = Array.from({ length: 200 }, (_, i) => `output-line-${i}: some data here`).join('\n');
    const msgs: Message[] = [{ role: 'user', content: big }];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toMatch(/\[… \d+ lines truncated …\]/);
    expect(stats.toolResult).toBeGreaterThan(0);
  });

  // --- Error Line Preservation ---

  it('preserves error lines and never elides them mid-line', () => {
    const errors = [
      'Error: ECONNREFUSED 127.0.0.1:3000',
      'TypeError: Cannot read properties of undefined',
      'FATAL: connection pool exhausted',
    ];
    const filler = Array.from({ length: 80 }, (_, i) => `filler-${i}`).join('\n');
    const content = `${errors.join('\n')}\n${filler}`;
    const msgs: Message[] = [{ role: 'user', content: content }];
    const { compressed } = compressor.compress(msgs);
    for (const err of errors) {
      expect(compressed[0].content).toContain(err);
    }
  });

  // --- Empty Input ---

  it('returns empty output for empty input', () => {
    const { compressed, stats } = compressor.compress([]);
    expect(compressed).toEqual([]);
    expect(stats.toolResult).toBe(0);
  });

  // --- Multi-Message ---

  it('processes each message independently', () => {
    const big = Array.from({ length: 200 }, (_, i) => `line-${i}`).join('\n');
    const small = 'short message';
    const msgs: Message[] = [
      { role: 'user', content: big },
      { role: 'assistant', content: small },
    ];
    const { compressed, stats } = compressor.compress(msgs);
    expect(compressed[0].content).toContain('truncated');
    expect(compressed[1].content).toBe(small);
    expect(stats.toolResult).toBeGreaterThan(0);
  });

  // --- Role Preservation ---

  it('preserves message roles through compression', () => {
    const big = Array.from({ length: 200 }, (_, i) => `line-${i}`).join('\n');
    const msgs: Message[] = [
      { role: 'system', content: big },
      { role: 'user', content: big },
      { role: 'assistant', content: big },
    ];
    const { compressed } = compressor.compress(msgs);
    expect(compressed[0].role).toBe('system');
    expect(compressed[1].role).toBe('user');
    expect(compressed[2].role).toBe('assistant');
  });
});
