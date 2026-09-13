#!/usr/bin/env node
// OmniFree unified dispatcher — called from .claude/commands/use.md
import { inferIntent, dispatch } from '../dist/cli.js';
import { Config } from '../dist/config/Config.js';
import { Pool } from '../dist/router/Pool.js';
import { Router } from '../dist/router/Router.js';
import { PriorityStrategy } from '../dist/router/strategies/PriorityStrategy.js';
import { Compressor } from '../dist/compression/Compressor.js';

const input = process.argv.slice(2).join(' ') || '';
const intent = inferIntent(input.replace(/^\/use\s*/, ''));

if (intent === 'slash' && (input.trim() === '/use' || input.trim() === '')) {
  const { HelpCommand } = await import('../dist/commands/HelpCommand.js');
  const help = new HelpCommand();
  console.log(help.execute());
  process.exit(0);
}

console.log(`[OmniFree] intent=${intent} input=${JSON.stringify(input)}`);
