import { PluginConfig } from '../types';
import { DEFAULT_CONFIG } from './defaults';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Deep merge two objects, preserving nested structure.
 * Arrays are replaced, not merged.
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      targetValue &&
      typeof sourceValue === 'object' &&
      typeof targetValue === 'object' &&
      !Array.isArray(sourceValue) &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as any);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as any;
    }
  }
  return result;
}

/**
 * Validate that loaded config matches expected shape.
 * Allows partial configs (fields not present are treated as optional).
 */
function validateConfig(config: any): config is Partial<PluginConfig> {
  if (!config || typeof config !== 'object') return false;
  if (config.strategy !== undefined && !['priority', 'round-robin', 'cost'].includes(config.strategy)) return false;
  if (config.compression !== undefined && ![0, 1, 2].includes(config.compression)) return false;
  if (config.providers !== undefined && (typeof config.providers !== 'object' || Array.isArray(config.providers))) return false;
  return true;
}

export class Config {
  private static readonly CONFIG_PATH = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'plugins',
    'omnifree',
    'config.json'
  );

  load(): PluginConfig {
    try {
      if (fs.existsSync(Config.CONFIG_PATH)) {
        const content = fs.readFileSync(Config.CONFIG_PATH, 'utf-8');
        const saved = JSON.parse(content);

        if (!validateConfig(saved)) {
          console.warn('[OmniFree] Config validation failed, using defaults');
          return { ...DEFAULT_CONFIG };
        }

        // Deep merge to preserve nested providers object
        return deepMerge({ ...DEFAULT_CONFIG }, saved);
      }
    } catch (err) {
      console.warn('[OmniFree] Failed to load config, using defaults:', err);
    }
    return { ...DEFAULT_CONFIG };
  }

  save(config: PluginConfig): void {
    const dir = path.dirname(Config.CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(Config.CONFIG_PATH, content);
  }
}