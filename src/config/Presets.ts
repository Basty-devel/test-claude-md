import { PluginConfig, ProviderConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface Preset {
  name: string;
  strategy: 'priority' | 'round-robin' | 'cost';
  compression: 0 | 1 | 2 | 3;
  prediction?: boolean;
  repoScope?: Record<string, unknown>;
}

/**
 * Typed domain error for preset operations.
 * Carries an optional `suggestion` for did-you-mean hints.
 */
export class PresetError extends Error {
  constructor(message: string, public readonly suggestion?: string, public readonly cause?: Error) {
    super(message);
    this.name = 'PresetError';
  }
}

export type PresetsMap = Record<string, Preset>;

/**
 * Preset storage: name -> Preset mapping persisted at
 * ~/.claude/plugins/omnifree/presets.json, alongside config.json.
 * Built-ins (freeflow, minimal) are immutable and only resolvable, never written.
 */
export class Presets {
  private static readonly PRESETS_PATH = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'plugins',
    'omnifree',
    'presets.json'
  );

  private static readonly BUILTINS: PresetsMap = {
    freeflow: {
      name: 'freeflow',
      strategy: 'round-robin',
      compression: 3,
      prediction: true
    },
    minimal: {
      name: 'minimal',
      strategy: 'priority',
      compression: 1,
      prediction: false
    }
  };

  /** List immutable built-in preset names, in stable order. */
  listBuiltins(): string[] {
    return Object.keys(Presets.BUILTINS);
  }

  /** Resolve a built-in preset by name. */
  getBuiltin(name: string): Preset | undefined {
    return Presets.BUILTINS[name];
  }

  /**
   * Load user presets from disk.
   * Returns {} when the file is absent or unreadable (treated as no user presets).
   */
  load(): PresetsMap {
    try {
      if (fs.existsSync(Presets.PRESETS_PATH)) {
        const content = fs.readFileSync(Presets.PRESETS_PATH, 'utf-8');
        return this.validateAndParse(content);
      }
    } catch (err) {
      throw new PresetError('Failed to load presets', undefined, err instanceof Error ? err : undefined);
    }
    return {};
  }

  private validateAndParse(content: string): PresetsMap {
    const saved: unknown = JSON.parse(content);
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
      throw new PresetError('Presets file has invalid shape: expected an object map');
    }
    const map: PresetsMap = {};
    for (const [key, value] of Object.entries(saved)) {
      let preset: Preset;
      try {
        preset = this.coercePreset(key, value as Record<string, unknown>);
      } catch (err) {
        throw new PresetError(
          `Skipping preset "${key}" in presets file: ${err instanceof Error ? err.message : String(err)}`,
          undefined,
          err instanceof Error ? err : undefined
        );
      }
      map[key] = preset;
    }
    return map;
  }

  private coercePreset(name: string, raw: Record<string, unknown>): Preset {
    const strategy = raw.strategy;
    const compression = raw.compression;
    if (strategy !== 'priority' && strategy !== 'round-robin' && strategy !== 'cost') {
      throw new PresetError(`Invalid strategy in preset "${name}"`);
    }
    if (typeof compression !== 'number' || (compression !== 0 && compression !== 1 && compression !== 2 && compression !== 3)) {
      throw new PresetError(`Invalid compression in preset "${name}"`);
    }
    const preset: Preset = {
      name,
      strategy,
      compression
    };
    if (typeof raw.prediction === 'boolean') {
      preset.prediction = raw.prediction;
    }
    if (typeof raw.repoScope === 'object' && raw.repoScope !== null && !Array.isArray(raw.repoScope)) {
      preset.repoScope = raw.repoScope as Record<string, unknown>;
    }
    return preset;
  }

  /** Persist user presets map to disk, preserving the same directory as config.json. */
  saveAll(map: PresetsMap): void {
    const dir = path.dirname(Presets.PRESETS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = JSON.stringify(map, null, 2) + '\n';
    fs.writeFileSync(Presets.PRESETS_PATH, content);
  }

  /** Save one preset (user-defined; built-ins cannot be overwritten). */
  save(name: string, preset: Omit<Preset, 'name'> & { name?: string }): void {
    this.validate({ ...preset, name });
    if (name === 'freeflow' || name === 'minimal') {
      throw new PresetError('Cannot overwrite builtin preset: ' + name);
    }
    const current = this.load();
    const full: Preset = { ...preset, name };
    current[name] = full;
    this.saveAll(current);
  }

  /**
   * Resolve a preset by name: built-ins first, then user presets.
   * Throws PresetError with a did-you-mean hint when unknown.
   */
  get(name: string): Preset {
    const builtin = Presets.BUILTINS[name];
    if (builtin) {
      return builtin;
    }
    const user = this.load()[name];
    if (user) {
      return user;
    }
    const suggestion = this.suggest(name);
    throw new PresetError(
      suggestion ? `Preset not found: ${name}. Did you mean: ${suggestion}?` : `Preset not found: ${name}`,
      suggestion
    );
  }

  /** Delete a user preset. Built-ins and unknown names throw typed errors. */
  delete(name: string): void {
    if (name === 'freeflow' || name === 'minimal') {
      throw new PresetError('Cannot delete builtin preset: ' + name);
    }
    const current = this.load();
    if (!current[name]) {
      const suggestion = this.suggest(name);
      throw new PresetError(
        suggestion ? `Preset not found: ${name}. Did you mean: ${suggestion}?` : `Preset not found: ${name}`,
        suggestion
      );
    }
    delete current[name];
    this.saveAll(current);
  }

  /** All resolvable preset names: built-ins then user presets, deduplicated. */
  listAll(): string[] {
    const user = Object.keys(this.load());
    const all = [...this.listBuiltins()];
    for (const name of user) {
      if (!all.includes(name)) {
        all.push(name);
      }
    }
    return all;
  }

  /**
   * Produce a single-field lean config from a preset.
   * Returns an object holding only the fields the preset defines (strategy,
   * compression, prediction), ready to merge over the current config.
   */
  toOverrides(preset: Preset): Partial<PluginConfig> & { prediction?: boolean } {
    const overrides: Partial<PluginConfig> & { prediction?: boolean } = {
      strategy: preset.strategy,
      compression: preset.compression
    };
    if (preset.prediction !== undefined) {
      overrides.prediction = preset.prediction;
    }
    return overrides;
  }

  /** Apply a preset's field overrides onto a full config snapshot. */
  applyPreset(config: PluginConfig, preset: Preset): PluginConfig {
    const overrides = this.toOverrides(preset);
    const next: PluginConfig = {
      ...config,
      strategy: overrides.strategy ?? config.strategy,
      compression: (overrides.compression as 0 | 1 | 2 | 3) ?? config.compression,
      providers: { ...config.providers } as Record<string, ProviderConfig>
    };
    return next;
  }

  /** Validate a preset definition against allowed strategy/compression ranges. */
  validate(preset: { strategy?: unknown; compression?: unknown; prediction?: unknown; name?: string }): void {
    const label = preset.name ? `preset "${preset.name}"` : 'preset';
    if (
      preset.strategy !== undefined &&
      preset.strategy !== 'priority' &&
      preset.strategy !== 'round-robin' &&
      preset.strategy !== 'cost'
    ) {
      throw new PresetError(`Invalid strategy for ${label}: expected priority, round-robin, or cost`);
    }
    if (
      preset.compression !== undefined &&
      (typeof preset.compression !== 'number' ||
        (preset.compression !== 0 && preset.compression !== 1 && preset.compression !== 2 && preset.compression !== 3))
    ) {
      throw new PresetError(`Invalid compression for ${label}: expected 0, 1, 2, or 3`);
    }
    if (preset.prediction !== undefined && typeof preset.prediction !== 'boolean') {
      throw new PresetError(`Invalid prediction for ${label}: expected boolean`);
    }
  }

  /** Best-match suggestion against built-ins plus saved user presets. */
  private suggest(name: string): string | undefined {
    const candidates = this.listAll();
    let best: string | undefined;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const distance = this.levenshtein(name, candidate);
      const threshold = Math.max(2, Math.floor(name.length / 2));
      if (distance <= threshold && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }
}