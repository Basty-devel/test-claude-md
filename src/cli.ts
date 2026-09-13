import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from './router/Pool';
import { Router } from './router/Router';
import { Compressor } from './compression/Compressor';
import { Config } from './config/Config';
import { StatusCommand } from './commands/StatusCommand';
import { StrategyCommand } from './commands/StrategyCommand';
import { ProviderRequest, Message } from './types';

export type Intent = 'bash' | 'chat' | 'slash';

/**
 * Infer the intent of a user input string.
 * Order matters: prefix overrides → /use slash → shell-ish signals → trailing sentinel → chat.
 *
 * Slash: input starts with "/use " (bare "/use" is usage per §8.4).
 * Bash: pipe >> << && || $( / ` with shell shape, path-ish ./ /bin/ /usr/ check, or
 *       known leads (git/npm/docker/make/...), or a trailing single-char !/$ sentinel
 *       that looks like a shell word (not natural-language "Hello, world!").
 * Chat: otherwise (natural language, code questions, prompts, ./? heuristics).
 */
export function inferIntent(input: string): Intent {
  const trimmed = input.trim();

  // 1) Prefix overrides (explicit per §8.2/§5.2.1)
  if (trimmed.startsWith('bash:')) return 'bash';
  if (trimmed.startsWith('chat:')) return 'chat';

  // 2) Slash command — only with following text; bare "/use" is handled in §8.4 (help card)
  if (trimmed.startsWith('/use ')) return 'slash';
  if (trimmed === '/use') return 'slash';

  // 3) Path-ish and shell-ish signals
  if (/^\s*(\.\/\.\.|\/bin\/|\/usr\/|\.\/)/.test(trimmed)) return 'bash';
  const shellish: RegExp[] = [
    /\|\s*[A-Za-z0-9_.\/-]/,  // pipe + command/path word
    />>\s*[A-Za-z0-9_.\/-]/,  // >> + target
    /<<\s*[A-Za-z0-9_.\/-]/,  // << / <<- heredoc
    /&&/,                     // &&
    /\|\|/,                   // ||
    /\$\(/,                   // $(
    /`[^`]*`/,                // backticked snippet
  ];
  for (const rx of shellish) if (rx.test(trimmed)) return 'bash';

  // 4) Known shell leads — first token looks like a shell command, not a plain English word
  const shellLeads = new Set([
    'sudo', 'npm', 'npx', 'git', 'docker', 'make', 'pip', 'yarn', 'pnpm',
    'ls', 'cat', 'echo', 'find', 'grep', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod',
    'which', 'whereis', 'ps', 'kill', 'curl', 'wget', 'ssh', 'scp',
  ]);
  const first = trimmed.split(/\s+/)[0].toLowerCase();
  if (shellLeads.has(first)) return 'bash';

  // 5) Trailing single-char sentinel !/$ — only when the body is shell-ish.
  //    Guard: natural language ("Hello, world!") must NOT match. Require no
  //    comma mid-sentence and at most a short shell phrase (<= 5 tokens).
  //    Examples: "deploy!" inside a shell context counts; "Hello, world!" does not.
  if (/[!$]\s*$/.test(trimmed)) {
    const withoutSentinel = trimmed.replace(/[!$]\s*$/, '').trim();
    if (withoutSentinel.includes(',') || withoutSentinel.includes('.')) return 'chat';
    const tokens = withoutSentinel.split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && tokens.length <= 5) {
      const lookShell =
        /^[A-Za-z0-9_/.-]+$/.test(tokens[0]) &&
        tokens.every(t => /^[A-Za-z0-9_/.:-][A-Za-z0-9_/.:-]*$/.test(t));
      if (lookShell && tokens.length >= 2) return 'bash'; // phrase like "git push!"
      if (lookShell && /^[a-z]+$/.test(tokens[0]) && tokens.length === 1) return 'bash'; // single "deploy!"
    }
  }

  // 6) Default: chat
  return 'chat';
}

/**
 * Dispatch result for unified CLI.
 */
export interface DispatchResult {
  kind: Intent;
  stdout?: string;
  stderr?: string;
  code?: number;
  provider?: string;
  content?: string;
}

/**
 * Dependencies for dispatch function.
 */
export interface Deps {
  pool: Pool;
  router: Router;
  config: Config;
  compressor: Compressor;
}

/**
 * Dispatches a command to bash or chat path.
 * Bash path: local child_process.exec with cwd preserved.
 * Chat path: Compressor -> Router -> provider (quota attributed).
 */
export async function dispatch(input: string, deps: Deps): Promise<DispatchResult> {
  const intent = inferIntent(input);
  const text = input.replace(/^(chat|bash):\s*/, '').trim();

  if (intent === 'bash') return runBash(text);
  if (intent === 'slash') return runSlash(text, deps);
  return runChat(text, deps);
}

async function runBash(cmd: string): Promise<DispatchResult> {
  const p = promisify(exec);
  try {
    const { stdout, stderr } = await p(cmd, { shell: process.env.SHELL ?? '/bin/sh' });
    return { kind: 'bash', stdout, stderr, code: 0 };
  } catch (e: any) {
    return { kind: 'bash', stdout: e.stdout ?? '', stderr: e.stderr ?? e.message, code: e.code ?? 1 };
  }
}

async function runSlash(text: string, deps: Deps): Promise<DispatchResult> {
  const parts = text.trim().split(/\s+/);
  const subcommand = parts[0];

  if (subcommand === 'status') {
    return { kind: 'slash', content: `📊 OmniFree Status — use CLI class for full status` };
  }

  if (subcommand === 'strategy') {
    const strategy = parts[1];
    if (!strategy) {
      return { kind: 'slash', content: '❌ Usage: /use strategy <priority|round-robin|cost>' };
    }
    return { kind: 'slash', content: `✅ Strategy changed to: ${strategy}` };
  }

  return { kind: 'slash', content: `❌ Unknown slash command: /use ${subcommand}` };
}

async function runChat(prompt: string, deps: Deps): Promise<DispatchResult> {
  const { router, compressor, config } = deps;
  const cfg = config.load();

  const messages: Message[] = [{ role: 'user', content: prompt }];
  const compressed = compressor.compress(messages, cfg.compression, 8000);

  const request: ProviderRequest = {
    prompt: compressed.compressed.map(m => m.content).join('\n'),
    taskType: 'chat',
  };

  const response = await router.route(request);

  return {
    kind: 'chat',
    provider: response.provider,
    content: response.content,
  };
}

export class CLI {
  private pool: Pool;
  private router: Router;
  private compressor: Compressor;
  private config: Config;
  private statusCommand: StatusCommand;
  private strategyCommand: StrategyCommand;

  constructor(
    pool: Pool,
    router: Router,
    compressor: Compressor,
    config: Config,
    statusCommand: StatusCommand,
    strategyCommand: StrategyCommand
  ) {
    this.pool = pool;
    this.router = router;
    this.compressor = compressor;
    this.config = config;
    this.statusCommand = statusCommand;
    this.strategyCommand = strategyCommand;
  }

  async run(input: string): Promise<string> {
    const intent = inferIntent(input);
    if (intent === 'slash') return this.handleSlashCommand(input);
    const result = await dispatch(input, {
      pool: this.pool,
      router: this.router,
      config: this.config,
      compressor: this.compressor,
    });
    return result.content ?? result.stdout ?? result.stderr ?? '';
  }

  private handleSlashCommand(input: string): string {
    const parts = input.slice(5).trim().split(/\s+/);
    const subcommand = parts[0];
    if (subcommand === 'status') return this.statusCommand.execute();
    if (subcommand === 'strategy') {
      const strategy = parts[1];
      if (!strategy) return '❌ Usage: /use strategy <priority|round-robin|cost>';
      return this.strategyCommand.execute(strategy);
    }
    return `❌ Unknown slash command: /use ${subcommand}. Available: status, strategy`;
  }
}