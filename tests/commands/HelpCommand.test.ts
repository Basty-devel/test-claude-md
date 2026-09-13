import { describe, it, expect } from 'vitest';
import { HelpCommand } from '../../src/commands/HelpCommand';

const help = new HelpCommand();

describe('HelpCommand — separated /use help card (per §8.4)', () => {
  it('bare /use shows main help card with no side effects (not Browser-tab content)', () => {
    const card = help.execute();
    expect(card).toContain('/use status');
    expect(card).toContain('/use providers');
    expect(card).toContain('/use compress stats');
    expect(card).toMatch(/intent inferred/i);
    expect(card).not.toContain('error'); // help is non-error
  });

  it('/use --help and /use -h surface a slash reference', () => {
    const slash = help.execute('slash');
    expect(slash).toContain('/use strategy');
    expect(slash).toContain('/use compress stats');
  });

  it('/use compress --help surfaces level help', () => {
    const compress = help.execute('compress');
    expect(compress).toContain('0=off');
    expect(compress).toContain('/use compress');
  });
});
