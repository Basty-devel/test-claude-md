import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetsCommand } from '../../src/commands/PresetsCommand';
import { Presets, PresetError } from '../../src/config/Presets';
import { Config } from '../../src/config/Config';
import { PluginConfig } from '../../src/types';
import * as fs from 'fs';

vi.mock('fs');

const makeConfig = (overrides: Partial<PluginConfig> = {}): PluginConfig => ({
  strategy: 'priority',
  compression: 2,
  providers: {},
  emergency: 'local',
  watchdog: true,
  ...overrides
});

describe('PresetsCommand', () => {
  let presetsCommand: PresetsCommand;
  let presets: Presets;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    presets = new Presets();
    config = new Config();
    presetsCommand = new PresetsCommand(presets, config);
  });

  describe('list', () => {
    it('should list builtin and user presets', () => {
      // Pre-populate user presets on disk
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'my-preset': { name: 'my-preset', strategy: 'cost', compression: 2, prediction: false }
      }));

      const result = presetsCommand.handle([]);
      expect(result).toContain('freeflow');
      expect(result).toContain('(built-in)');
      expect(result).toContain('my-preset');
      expect(result).not.toContain('(built-in) my-preset');
    });

    it('should show preset with prediction when enabled', () => {
      const result = presetsCommand.handle(['list']);
      expect(result).toContain('prediction');
    });
  });

  describe('show', () => {
    it('should show a specific preset', () => {
      const result = presetsCommand.handle(['show', 'freeflow']);
      expect(result).toContain('Preset: freeflow');
      expect(result).toContain('strategy:    round-robin');
      expect(result).toContain('compression: 3');
      expect(result).toContain('prediction:  true');
    });

    it('should throw when name is missing', () => {
      expect(() => presetsCommand.handle(['show'])).toThrow(PresetError);
    });
  });

  describe('save', () => {
    it('should save preset from current config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      vi.spyOn(config, 'load').mockReturnValue(makeConfig({ strategy: 'cost', compression: 1 }));

      const result = presetsCommand.handle(['save', 'my-cost']);
      expect(result).toContain('Saved preset "my-cost"');
      expect(result).toContain('strategy=cost');
      expect(result).toContain('compression=1');
    });

    it('should throw when name is missing', () => {
      expect(() => presetsCommand.handle(['save'])).toThrow(PresetError);
    });

    it('should throw when trying to overwrite builtin', () => {
      expect(() => presetsCommand.handle(['save', 'freeflow'])).toThrow('Cannot overwrite builtin');
    });
  });

  describe('load', () => {
    it('should apply preset to config and save', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.spyOn(config, 'load').mockReturnValue(makeConfig());

      const result = presetsCommand.handle(['load', 'freeflow']);
      expect(result).toContain('Applied preset "freeflow"');
      expect(result).toContain('strategy=round-robin');
      expect(result).toContain('compression=3');
      expect(result).toContain('prediction');
    });

    it('should handle direct form: preset <name>', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.spyOn(config, 'load').mockReturnValue(makeConfig());

      const result = presetsCommand.handle(['minimal']);
      expect(result).toContain('Applied preset "minimal"');
      expect(result).toContain('strategy=priority');
      expect(result).toContain('compression=1');
    });

    it('should throw when name is missing', () => {
      expect(() => presetsCommand.handle(['load'])).toThrow(PresetError);
    });
  });

  describe('delete', () => {
    it('should delete a user preset', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'my-preset': { name: 'my-preset', strategy: 'priority', compression: 2, prediction: false }
      }));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const result = presetsCommand.handle(['delete', 'my-preset']);
      expect(result).toContain('Deleted preset "my-preset"');
      // Verify the file was rewritten without the deleted preset
      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(savedData['my-preset']).toBeUndefined();
    });

    it('should throw when name is missing', () => {
      expect(() => presetsCommand.handle(['delete'])).toThrow(PresetError);
    });
  });

  describe('error handling', () => {
    it('should propagate PresetError from presets', () => {
      expect(() => presetsCommand.handle(['load', 'unknown'])).toThrow(PresetError);
    });

    it('should propagate errors from config.save', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.spyOn(config, 'load').mockReturnValue(makeConfig());
      vi.spyOn(config, 'save').mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => presetsCommand.handle(['load', 'minimal'])).toThrow('Disk full');
    });
  });
});
