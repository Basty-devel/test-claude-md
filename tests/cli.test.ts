import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferIntent, CLI } from '../../src/cli';
import { Pool } from '../../src/router/Pool';
import { Router } from '../../src/router/Router';
import { Compressor } from '../../src/compression/Compressor';
import { Config } from '../../src/config/Config';
import { StatusCommand } from '../../src/commands/StatusCommand';
import { StrategyCommand } from '../../src/commands/StrategyCommand';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';
import { PriorityStrategy } from '../../src/router/strategies/PriorityStrategy';

vi.mock('../../src/config/Config');
vi.mock('../../src/router/Router');
vi.mock('../../src/compression/Compressor');
vi.mock('../../src/commands/StatusCommand');
vi.mock('../../src/commands/StrategyCommand');

describe('inferIntent', () => {
  it('should infer bash for pipe', () => {
    expect(inferIntent('ls | grep foo')).toBe('bash');
  });

  it('should infer bash for redirection', () => {
    expect(inferIntent('echo hello > out.txt')).toBe('bash');
  });

  it('should infer bash for append redirection', () => {
    expect(inferIntent('echo hello >> out.txt')).toBe('bash');
  });

  it('should infer bash for input redirection', () => {
    expect(inferIntent('cat < in.txt')).toBe('bash');
  });

  it('should infer bash for &&', () => {
    expect(inferIntent('cmd1 && cmd2')).toBe('bash');
  });

  it('should infer bash for ||', () => {
    expect(inferIntent('cmd1 || cmd2')).toBe('bash');
  });

  it('should infer bash for command substitution $()', () => {
    expect(inferIntent('echo $(date)')).toBe('bash');
  });

  it('should infer bash for backticks', () => {
    expect(inferIntent('echo `date`')).toBe('bash');
  });

  it('should infer bash for path starting with ./', () => {
    expect(inferIntent('./script.sh')).toBe('bash');
  });

  it('should infer bash for path starting with /bin/', () => {
    expect(inferIntent('/bin/ls')).toBe('bash');
  });

  it('should infer bash for path starting with /usr/', () => {
    expect(inferIntent('/usr/bin/node')).toBe('bash');
  });

  it('should infer bash for sudo', () => {
    expect(inferIntent('sudo apt update')).toBe('bash');
  });

  it('should infer bash for npm', () => {
    expect(inferIntent('npm install')).toBe('bash');
  });

  it('should infer bash for git', () => {
    expect(inferIntent('git status')).toBe('bash');
  });

  it('should infer bash for docker', () => {
    expect(inferIntent('docker run ...')).toBe('bash');
  });

  it('should infer bash for trailing !', () => {
    expect(inferIntent('ls!')).toBe('bash');
  });

  it('should infer bash for trailing $', () => {
    expect(inferIntent('ls$')).toBe('bash');
  });

  it('should infer chat for normal text', () => {
    expect(inferIntent('Hello, how are you?')).toBe('chat');
  });

  it('should infer chat for question', () => {
    expect(inferIntent('What is the capital of France?')).toBe('chat');
  });

  it('should infer chat for code snippet without bash patterns', () => {
    expect(inferIntent('function foo() { return 1; }')).toBe('chat');
  });

  it('should override with bash: prefix', () => {
    expect(inferIntent('bash: echo hello')).toBe('bash');
  });

  it('should override with chat: prefix', () => {
    expect(inferIntent('chat: ls | grep foo')).toBe('chat');
  });

  it('should detect slash command /use status', () => {
    expect(inferIntent('/use status')).toBe('slash');
  });

  it('should detect slash command /use strategy', () => {
    expect(inferIntent('/use strategy round-robin')).toBe('slash');
  });
});

describe('CLI', () => {
  let pool: Pool;
  let mockRouter: Router;
  let mockCompressor: Compressor;
  let mockConfig: Config;
  let mockStatusCommand: StatusCommand;
  let mockStrategyCommand: StrategyCommand;
  let cli: CLI;

  beforeEach(() => {
    vi.clearAllMocks();

    pool = new Pool();
    mockRouter = new Router(pool, new PriorityStrategy());
    mockCompressor = new Compressor();
    mockConfig = new Config();
    mockStatusCommand = new StatusCommand(pool, mockCompressor);
    mockStrategyCommand = new StrategyCommand(mockConfig);

    // Mock implementations - use spyOn with real instances
    const routeSpy = vi.spyOn(mockRouter, 'route');
    routeSpy.mockResolvedValue({
      content: 'AI response',
      tokensUsed: 10,
      model: 'test-model',
      provider: 'groq',
      latency: 100
    } as any);

    const compressSpy = vi.spyOn(mockCompressor, 'compress');
    compressSpy.mockReturnValue({
      compressed: [{ role: 'user', content: 'compressed' }],
      stats: { totalSaved: 0, percentage: 0, deduplication: 0, semantic: 0, truncation: 0, toolResult: 0, pruning: 0, cache: 0 },
      explain: {}
    } as any);

    vi.spyOn(mockStatusCommand, 'execute').mockReturnValue('📊 OmniFree Status\n✅ groq: 8000/14000 (57%)');
    vi.spyOn(mockStrategyCommand, 'execute').mockReturnValue('✅ Strategy changed to: round-robin');

    // Mock config.load for chat path
    vi.spyOn(mockConfig, 'load').mockReturnValue({
      strategy: 'priority',
      compression: 2,
      providers: {},
      emergency: 'local',
      watchdog: true
    });

    cli = new CLI(pool, mockRouter, mockCompressor, mockConfig, mockStatusCommand, mockStrategyCommand);
  });

  it('should execute bash command when inferred as bash', async () => {
    const result = await cli.run('bash: ls -la');
    expect(result).toBeDefined();
    expect(mockRouter.route).not.toHaveBeenCalled();
  });

  it('should execute chat when inferred as chat', async () => {
    const result = await cli.run('Hello, world!');
    expect(result).toContain('AI response');
    expect(mockRouter.route).toHaveBeenCalled();
    expect(mockCompressor.compress).toHaveBeenCalled();
  });

  it('should execute slash command /use status', async () => {
    vi.spyOn(mockStatusCommand, 'execute').mockReturnValue('📊 OmniFree Status\n✅ groq: 8000/14000 (57%)');
    const result = await cli.run('/use status');
    expect(result).toContain('OmniFree Status');
    expect(mockStatusCommand.execute).toHaveBeenCalled();
  });

  it('should execute slash command /use strategy', async () => {
    vi.spyOn(mockStrategyCommand, 'execute').mockReturnValue('✅ Strategy changed to: round-robin');
    const result = await cli.run('/use strategy round-robin');
    expect(result).toContain('Strategy changed to: round-robin');
    expect(mockStrategyCommand.execute).toHaveBeenCalledWith('round-robin');
  });

  it('should respect bash: prefix override', async () => {
    const result = await cli.run('bash: echo hello');
    expect(result).not.toContain('AI response');
  });

  it('should respect chat: prefix override', async () => {
    vi.spyOn(mockRouter, 'route').mockResolvedValue({
      content: 'AI response',
      tokensUsed: 10,
      model: 'test-model',
      provider: 'groq',
      latency: 100
    } as any);
    const result = await cli.run('chat: ls | grep foo');
    expect(result).toContain('AI response');
    expect(mockRouter.route).toHaveBeenCalled();
  });

  it('should not load provider credentials on bash path', async () => {
    await cli.run('ls -la');
    expect(mockRouter.route).not.toHaveBeenCalled();
  });

  it('should use compressor at configured level on chat path', async () => {
    vi.spyOn(mockConfig, 'load').mockReturnValue({
      strategy: 'priority',
      compression: 2,
      providers: {},
      emergency: 'local',
      watchdog: true
    });

    await cli.run('Hello');
    expect(mockCompressor.compress).toHaveBeenCalledWith(
      expect.any(Array),
      2,
      expect.any(Number)
    );
  });
});