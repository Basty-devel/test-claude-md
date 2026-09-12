import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from '../../src/config/Config';
import * as fs from 'fs';

vi.mock('fs');

describe('Config', () => {
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    config = new Config();
  });

  it('should load default config when no file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const loaded = config.load();

    expect(loaded.strategy).toBe('priority');
    expect(loaded.compression).toBe(2);
    expect(loaded.watchdog).toBe(true);
  });

  it('should save config to file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      strategy: 'round-robin',
      compression: 1
    }));

    const loaded = config.load();
    loaded.strategy = 'round-robin';
    config.save(loaded);

    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('should merge saved config with defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      strategy: 'cost'
    }));

    const loaded = config.load();

    expect(loaded.strategy).toBe('cost');
    expect(loaded.compression).toBe(2); // From defaults
  });
});