/**
 * /use help card — separated from CLI, per request (§8.4: bare /use shows an
 * actionable help card on the native Desktop App chat card, no Browser-tab dependency,
 * no side effects). CLI owns dispatch, HelpCommand owns the card.
 */
export type HelpTopic = 'slash' | 'compress';

export class HelpCommand {
  execute(topic?: string): string {
    if (topic === 'slash') return this.slashCard();
    if (topic === 'compress') return this.compressCard();
    return this.mainCard();
  }

  private mainCard(): string {
    return [
      '✨ /use — one line for both Bash and chat (intent inferred)',
      '',
      '/use "summarize this PR"              chat — compressed → routed provider',
      '/use "git log -1 --stat"              bash — local shell (cwd preserved)',
      '/use "bash: who am i"                 force bash',
      '/use "chat: ls -la"                   force chat (prompt, not exec)',
      '',
      'Direct slash (also available on the Desktop App chat card):',
      '  /use status   /use providers   /use compress stats',
      '  /use strategy <priority|round-robin|cost>',
      '  /use compress <0|1|2|3>  /use config',
      '  /use provider add|remove|disable <name>',
      '  /use forecast  /use emergency local|skip  /use savings',
      '',
      'More: /use -h · /use --help · docs/superpowers/specs/',
    ].join('\n');
  }

  private slashCard(): string {
    return [
      '📘 /use slash reference',
      '',
      '  /use status                         routing + quota',
      '  /use providers                      quota per provider',
      '  /use compress stats                 tokens saved this session',
      '  /use strategy <name>                priority|round-robin|cost',
      '  /use compress <0|1|2|3>             compression level (2 default)',
      '  /use config                         interactive wizard',
      '  /use provider add|remove|disable …  custom providers',
      '  /use forecast  /use emergency …  /use savings',
    ].join('\n');
  }

  private compressCard(): string {
    return [
      '📦 /use compress — token compression (billing-affecting)',
      '',
      '  0=off',
      '  1=dedup+semantic',
      '  2=all (default: Deduplicator→Semantic→SmartTruncator)',
      '  3=+toolResult+pruner+cachePin — massive savings mode',
      '',
      'Transport (off by default): Zstd wire compression >10k tokens — no billing effect.',
      'Stats: /use compress stats  (buckets: dedup/semantic/truncation/toolResult/pruning/cache)',
    ].join('\n');
  }
}