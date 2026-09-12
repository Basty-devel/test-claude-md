import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyCommand } from '../../src/commands/StrategyCommand';
import { Config } from '../../src/config/Config';
import { PluginConfig } from '../../src/types';

vi.mock('../../src/config/Config');

describe('StrategyCommand', () => {
  let command: StrategyCommand;
  let mockConfig: Config;
  let defaultConfig: PluginConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new Config();
    command = new StrategyCommand(mockConfig);

    defaultConfig = {
      strategy: 'priority',
      compression: 2,
      providers: {
        groq: { name: 'groq', category: 'chat', priority: 10, enabled: true },
        gemini: { name: 'gemini', category: 'chat', priority: 8, enabled: true },
      },
      emergency: 'local',
      watchdog: true
    };
  });

  it('should change strategy when valid', () => {
    vi.mocked(mockConfig.load).mockReturnValue({ ...defaultConfig });

    const result = command.execute('round-robin');

    expect(result).toContain('round-robin');
    expect(mockConfig.save).toHaveBeenCalled();
    const savedConfig = vi.mocked(mockConfig.save).mock.calls[0][0];
    expect(savedConfig.strategy).toBe('round-robin');
  });

  it('should change strategy to cost', () => {
    vi.mocked(mockConfig.load).mockReturnValue({ ...defaultConfig });

    const result = command.execute('cost');

    expect(result).toContain('cost');
    expect(mockConfig.save).toHaveBeenCalled();
    const savedConfig = vi.mocked(mockConfig.save).mock.calls[0][0];
    expect(savedConfig.strategy).toBe('cost');
  });

  it('should change strategy to priority', () => {
    vi.mocked(mockConfig.load).mockReturnValue({ ...defaultConfig });

    const result = command.execute('priority');

    expect(result).toContain('priority');
    expect(mockConfig.save).toHaveBeenCalled();
    const savedConfig = vi.mocked(mockConfig.save).mock.calls[0][0];
    expect(savedConfig.strategy).toBe('priority');
  });

  it('should reject invalid strategy', () => {
    vi.mocked(mockConfig.load).mockReturnValue({ ...defaultConfig });

    const result = command.execute('invalid');

    expect(result).toContain('Invalid strategy');
    expect(result).toContain('priority, round-robin, cost');
    expect(mockConfig.save).not.toHaveBeenCalled();
  });

  it('should reject empty strategy', () => {
    vi.mocked(mockConfig.load).mockReturnValue({ ...defaultConfig });

    const result = command.execute('');

    expect(result).toContain('Invalid strategy');
    expect(mockConfig.save).not.toHaveBeenCalled();
  });
});