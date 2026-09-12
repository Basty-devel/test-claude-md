import { PluginConfig } from '../types';
import { DEFAULT_CONFIG } from './defaults';
import * as fs from 'fs';
import * as path from 'path';

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
        const saved = JSON.parse(fs.readFileSync(Config.CONFIG_PATH, 'utf-8'));
        return { ...DEFAULT_CONFIG, ...saved };
      }
    } catch {
      // Fall through to defaults
    }
    return { ...DEFAULT_CONFIG };
  }

  save(config: PluginConfig): void {
    const dir = path.dirname(Config.CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(Config.CONFIG_PATH, JSON.stringify(config, null, 2));
  }
}