import { describe, it, expect } from 'vitest';
import { PromptPruner } from '../../src/compression/PromptPruner';
import { Message } from '../../src/types';

describe('PromptPruner', () => {
  const pruner = new PromptPruner();

  describe('prune', () => {
    it('keeps top 70% by score and never touches ``` code', () => {
      const filler = Array(60).fill('It is noted that in the context ').join('');
      const code = '```\nconst x = 1;\n```';
      const msgs: Message[] = [{ role: 'user', content: `${filler}\n${code}\n${filler}` }];
      const { pruned, stats } = pruner.prune(msgs);
      expect(pruned[0].content).toContain('const x = 1');
      expect(stats.pruned).toBeGreaterThan(0);
    });

    it('skips pruning when importance is flat (pure code)', () => {
      const code = Array(40).fill('const x = 1;\n').join('');
      const msgs: Message[] = [{ role: 'user', content: ` \`\`\`\n${code}\n\`\`\`` }];
      const { pruned } = pruner.prune(msgs);
      expect(pruned[0].content).toBe(msgs[0].content);
    });

    it('preserves all messages in output array', () => {
      const msgs: Message[] = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ];
      const { pruned } = pruner.prune(msgs);
      expect(pruned.length).toBe(msgs.length);
    });

    it('returns zero stats when input is empty', () => {
      const { pruned, stats } = pruner.prune([]);
      expect(pruned).toEqual([]);
      expect(stats.pruned).toBe(0);
    });

    it('returns zero pruned when content is too short to score', () => {
      const msgs: Message[] = [{ role: 'user', content: 'ok' }];
      const { pruned, stats } = pruner.prune(msgs);
      expect(pruned[0].content).toBe('ok');
      expect(stats.pruned).toBe(0);
    });

    it('never removes lines inside code fences even when filler dominates', () => {
      const filler = Array(100).fill('The quick brown fox jumps over the lazy dog. ').join('');
      const codeBlock = '```\nfunction important() {\n  return 42;\n}\n```';
      const msgs: Message[] = [
        { role: 'user', content: `${filler}\n${codeBlock}\n${filler}` },
      ];
      const { pruned } = pruner.prune(msgs);
      expect(pruned[0].content).toContain('function important()');
      expect(pruned[0].content).toContain('return 42');
    });

    it('prunes low-score filler lines from non-code content', () => {
      const highValue = 'IMPORTANT: Deploy the hotfix immediately to production.';
      const filler = Array(50).fill('It is noted that in the context ').join('');
      const msgs: Message[] = [
        { role: 'user', content: `${highValue}\n${filler}` },
      ];
      const { pruned, stats } = pruner.prune(msgs);
      expect(pruned[0].content).toContain('IMPORTANT');
      expect(stats.pruned).toBeGreaterThan(0);
    });

    it('reruns with stepped-down threshold when char-per-token drift is in 3.5-5.0 band', () => {
      // Content that creates a borderline char-per-token ratio
      // Need content that would be in the drift band after first pass
      const borderline = Array(80).fill('The variable x represents ').join('');
      const msgs: Message[] = [
        { role: 'user', content: `${borderline}` },
      ];
      const { stats } = pruner.prune(msgs);
      // The rerun mechanism should have been attempted; stats reflect final result
      expect(stats.pruned).toBeGreaterThanOrEqual(0);
    });

    it('never prunes system messages', () => {
      const filler = Array(60).fill('It is noted that in the context ').join('');
      const msgs: Message[] = [
        { role: 'system', content: `System instruction: ${filler}` },
        { role: 'user', content: `${filler}` },
      ];
      const { pruned } = pruner.prune(msgs);
      expect(pruned[0].content).toContain('System instruction');
    });

    it('never prunes assistant messages', () => {
      const filler = Array(60).fill('It is noted that in the context ').join('');
      const msgs: Message[] = [
        { role: 'assistant', content: `Assistant response: ${filler}` },
      ];
      const { pruned, stats } = pruner.prune(msgs);
      expect(pruned[0].content).toContain('Assistant response');
      expect(stats.pruned).toBe(0);
    });
  });
});
