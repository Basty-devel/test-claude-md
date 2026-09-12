import { Config } from '../config/Config';
import { PluginConfig } from '../types';

export class StrategyCommand {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  execute(strategy: string): string {
    const validStrategies: PluginConfig['strategy'][] = ['priority', 'round-robin', 'cost'];
    if (!validStrategies.includes(strategy as PluginConfig['strategy'])) {
      return `❌ Invalid strategy. Valid options: ${validStrategies.join(', ')}`;
    }

    const config = this.config.load();
    config.strategy = strategy as PluginConfig['strategy'];
    this.config.save(config);

    return `✅ Strategy changed to: ${strategy}`;
  }
}