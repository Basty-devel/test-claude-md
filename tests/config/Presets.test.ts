import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Presets, PresetError } from '../../src/config/Presets';
import * as fs from 'fs';

vi.mock('fs');

describe('Presets', () => {
  let presets: Presets;

  beforeEach(() => {
    vi.clearAllMocks();
    presets = new Presets();
  });

  describe('built-in presets', () => {
    it('should have freeflow preset with correct settings', () => {
      const preset = presets.getBuiltin('freeflow');
      expect(preset).toEqual({
        name: 'freeflow',
        strategy: 'round-robin',
        compression: 3,
        prediction: true
      });
    });

    it('should have minimal preset with correct settings', () => {
      const preset = presets.getBuiltin('minimal');
      expect(preset).toEqual({
        name: 'minimal',
        strategy: 'priority',
        compression: 1,
        prediction: false
      });
    });
  });

  describe('list builtins', () => {
    it('should return list of builtin preset names', () => {
      const builtins = presets.listBuiltins();
      expect(builtins).toContain('freeflow');
      expect(builtins).toContain('minimal');
      expect(builtins.length).toBe(2);
    });
  });

  describe('save and load user presets', () => {
    it('should save preset to file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{}');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      presets.save('my-preset', {
        name: 'my-preset',
        strategy: 'cost',
        compression: 2,
        prediction: false
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should load saved presets from file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'my-preset': {
          name: 'my-preset',
          strategy: 'cost',
          compression: 2,
          prediction: false
        }
      }));

      const loaded = presets.load();
      expect(loaded['my-preset']).toEqual({
        name: 'my-preset',
        strategy: 'cost',
        compression: 2,
        prediction: false
      });
    });

    it('should return empty object when no presets file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const loaded = presets.load();
      expect(loaded).toEqual({});
    });
  });

  describe('get preset', () => {
    it('should get builtin preset by name', () => {
      const preset = presets.get('freeflow');
      expect(preset?.name).toBe('freeflow');
      expect(preset?.strategy).toBe('round-robin');
    });

    it('should get user preset by name', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'user-preset': {
          name: 'user-preset',
          strategy: 'priority',
          compression: 2,
          prediction: false
        }
      }));

      const preset = presets.get('user-preset');
      expect(preset?.name).toBe('user-preset');
    });

    it('should throw PresetError for unknown preset', () => {
      expect(() => presets.get('unknown')).toThrow(PresetError);
      expect(() => presets.get('unknown')).toThrow('Preset not found: unknown');
    });
  });

  describe('delete user preset', () => {
    it('should delete user preset from file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'user-preset': {
          name: 'user-preset',
          strategy: 'priority',
          compression: 2,
          prediction: false
        }
      }));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      presets.delete('user-preset');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const savedData = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(savedData['user-preset']).toBeUndefined();
    });

    it('should throw PresetError when deleting builtin preset', () => {
      expect(() => presets.delete('freeflow')).toThrow(PresetError);
      expect(() => presets.delete('freeflow')).toThrow('Cannot delete builtin preset: freeflow');
    });

    it('should throw PresetError when deleting unknown preset', () => {
      expect(() => presets.delete('unknown')).toThrow(PresetError);
      expect(() => presets.delete('unknown')).toThrow('Preset not found: unknown');
    });
  });

  describe('list all presets', () => {
    it('should return both builtin and user presets', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'user-preset': {
          name: 'user-preset',
          strategy: 'priority',
          compression: 2,
          prediction: false
        }
      }));

      const all = presets.listAll();
      expect(all).toContain('freeflow');
      expect(all).toContain('minimal');
      expect(all).toContain('user-preset');
      expect(all.length).toBe(3);
    });
  });

  describe('apply preset to config', () => {
    it('should apply preset settings to config', () => {
      const config = {
        strategy: 'priority' as const,
        compression: 2,
        providers: {},
        emergency: 'local' as const,
        watchdog: true
      };

      const preset = {
        name: 'test',
        strategy: 'round-robin' as const,
        compression: 3,
        prediction: true
      };

      const result = presets.applyPreset(config, preset);
      expect(result.strategy).toBe('round-robin');
      expect(result.compression).toBe(3);
    });

    it('should not change config when preset has undefined fields', () => {
      const config = {
        strategy: 'priority' as const,
        compression: 2,
        providers: {},
        emergency: 'local' as const,
        watchdog: true
      };

      const preset = {
        name: 'partial',
        strategy: 'cost' as const
      };

      const result = presets.applyPreset(config, preset);
      expect(result.strategy).toBe('cost');
      expect(result.compression).toBe(2); // unchanged
    });
  });

  describe('validation', () => {
    it('should reject invalid strategy', () => {
      expect(() => presets.validate({ strategy: 'invalid' })).toThrow(PresetError);
    });

    it('should reject invalid compression level', () => {
      expect(() => presets.validate({ compression: 5 })).toThrow(PresetError);
    });

    it('should accept valid preset', () => {
      expect(() => presets.validate({
        strategy: 'round-robin',
        compression: 2
      })).not.toThrow();
    });
  });

  describe('did-you-mean suggestions', () => {
    it('should suggest similar builtin preset', () => {
      expect(() => presets.get('freflow')).toThrow(PresetError);
      const error = (() => {
        try {
          presets.get('freflow');
        } catch (e) {
          return e as PresetError;
        }
      })();
      expect(error.message).toContain('Did you mean: freeflow?');
    });
  });
});
