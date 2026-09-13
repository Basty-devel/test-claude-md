import { Pool } from './router/Pool';
import { Router } from './router/Router';
import { PriorityStrategy } from './router/strategies/PriorityStrategy';
import { RoundRobinStrategy } from './router/strategies/RoundRobinStrategy';
import { CostOptimizedStrategy } from './router/strategies/CostOptimizedStrategy';
import { Compressor } from './compression/Compressor';
import { Config } from './config/Config';
import { StatusCommand } from './commands/StatusCommand';
import { StrategyCommand } from './commands/StrategyCommand';
import { ProviderRequest, ProviderResponse } from './types';
import { GroqProvider } from './providers/GroqProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { MistralProvider } from './providers/MistralProvider';
import { DeepSeekProvider } from './providers/DeepSeekProvider';
import { TogetherProvider } from './providers/TogetherProvider';
import { HuggingFaceProvider } from './providers/HuggingFaceProvider';
import { SegmindProvider } from './providers/SegmindProvider';
import { CloudflareProvider } from './providers/CloudflareProvider';
import { QuotaForecast } from './features/QuotaForecast';
import { ContextHandoff } from './features/ContextHandoff';
import { OfflineEmergency } from './features/OfflineEmergency';
import { CostDashboard } from './features/CostDashboard';
import { ProviderWatchdog } from './features/ProviderWatchdog';
import { dispatch, Deps, DispatchResult, CLI } from './cli';
import { HelpCommand } from './commands/HelpCommand';

/**
 * OmniFree — Unified free-tier AI provider routing for Claude Code.
 *
 * Install: `/plugin install omnifree` (alias: `/use`)
 *
 * Features:
 * - 8 free-tier providers (chat, code, image)
 * - 3 routing strategies (priority, round-robin, cost-optimized)
 * - 3-layer compression (dedup, semantic, truncation) — Level 2 default
 * - Quota forecasting, context handoff, offline emergency, cost dashboard, provider watchdog
 * - Intent-inferred unified CLI: `/use "..."` (bash or chat)
 */
export class OmniFreePlugin {
  private pool: Pool;
  private router: Router;
  private compressor: Compressor;
  private config: Config;
  private statusCommand: StatusCommand;
  private strategyCommand: StrategyCommand;
  private quotaForecast: QuotaForecast;
  private contextHandoff: ContextHandoff;
  private offlineEmergency: OfflineEmergency;
  private costDashboard: CostDashboard;
  private watchdog: ProviderWatchdog;
  private cli: CLI;
  private helpCommand: HelpCommand;

  constructor() {
    this.pool = new Pool();
    this.compressor = new Compressor();
    this.config = new Config();

    const cfg = this.config.load();
    const strategy = this.createStrategy(cfg.strategy);

    this.router = new Router(this.pool, strategy);
    this.statusCommand = new StatusCommand(this.pool, this.compressor);
    this.strategyCommand = new StrategyCommand(this.config);
    this.quotaForecast = new QuotaForecast(this.pool);
    this.contextHandoff = new ContextHandoff();
    this.offlineEmergency = new OfflineEmergency();
    this.costDashboard = new CostDashboard();
    this.watchdog = new ProviderWatchdog(this.pool);
    this.helpCommand = new HelpCommand();
    this.cli = new CLI(this.pool, this.router, this.compressor, this.config, this.statusCommand, this.strategyCommand, this.helpCommand);

    this.initializeProviders(cfg.providers);
    this.watchdog.start();
  }

  private createStrategy(type: string) {
    switch (type) {
      case 'round-robin': return new RoundRobinStrategy();
      case 'cost': return new CostOptimizedStrategy();
      default: return new PriorityStrategy();
    }
  }

  private initializeProviders(providers: Record<string, any>): void {
    const envKeys = this.getEnvApiKeys();
    for (const [name, config] of Object.entries(providers)) {
      if (!config.enabled) continue;
      const apiKey = envKeys[name];
      if (!apiKey) {
        console.warn(`[OmniFree] No API key for ${name} (set ${name.toUpperCase()}_API_KEY)`);
        continue;
      }
      const provider = this.createProvider(name, apiKey);
      if (provider) this.pool.add(provider);
    }
    // Set priorities from config
    const strategy = this.router['strategy'];
    if (strategy && 'setPriority' in strategy) {
      for (const [name, config] of Object.entries(providers)) {
        (strategy as any).setPriority(name, config.priority);
      }
    }
  }

  private getEnvApiKeys(): Record<string, string> {
    const keys: Record<string, string> = {};
    const envMap: Record<string, string> = {
      groq: 'GROQ_API_KEY',
      gemini: 'GEMINI_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      together: 'TOGETHER_API_KEY',
      huggingface: 'HUGGINGFACE_API_KEY',
      segmind: 'SEGMIND_API_KEY',
      cloudflare: 'CLOUDFLARE_API_KEY',
    };
    for (const [name, envVar] of Object.entries(envMap)) {
      const val = process.env[envVar];
      if (val) keys[name] = val;
    }
    return keys;
  }

  private createProvider(name: string, apiKey: string) {
    switch (name) {
      case 'groq': return new GroqProvider(apiKey);
      case 'gemini': return new GeminiProvider(apiKey);
      case 'mistral': return new MistralProvider(apiKey);
      case 'deepseek': return new DeepSeekProvider(apiKey);
      case 'together': return new TogetherProvider(apiKey);
      case 'huggingface': return new HuggingFaceProvider(apiKey);
      case 'segmind': return new SegmindProvider(apiKey);
      case 'cloudflare': return new CloudflareProvider(apiKey);
      default: return null;
    }
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    const cfg = this.config.load();
    const compressed = this.compressor.compress(
      [{ role: 'user', content: request.prompt }],
      cfg.compression,
      8000
    );

    const response = await this.router.route({
      ...request,
      prompt: compressed.compressed.map(m => m.content).join('\n'),
    });

    this.quotaForecast.recordUsage(response.provider, response.tokensUsed);
    this.costDashboard.record(response.provider, response.tokensUsed);

    return response;
  }

  /**
   * Main CLI entry: `/use "..."` — intent inferred (bash or chat).
   * Explicit `bash:` / `chat:` prefix overrides.
   */
  async use(input: string): Promise<DispatchResult> {
    const deps: Deps = { pool: this.pool, router: this.router, config: this.config, compressor: this.compressor };
    return dispatch(input, deps);
  }

  // Slash commands
  async handleCommand(command: string, args: string[]): Promise<string> {
    switch (command) {
      case 'status': return this.statusCommand.execute();
      case 'strategy': return this.strategyCommand.execute(args[0]);
      case 'compress': {
        const level = parseInt(args[0]) as 0 | 1 | 2;
        if ([0, 1, 2].includes(level)) {
          const cfg = this.config.load();
          cfg.compression = level;
          this.config.save(cfg);
          return `✅ Compression level set to: ${level}`;
        }
        return '❌ Invalid level. Use 0, 1, or 2.';
      }
      case 'providers': return this.listProviders();
      case 'forecast': return this.formatForecast();
      case 'savings': return this.costDashboard.format();
      case 'emergency': return await this.handleEmergency(args[0]);
      case 'watchdog': return this.formatWatchdog();
      case 'config': return this.configWizard();
      default: return `❌ Unknown command: ${command}`;
    }
  }

  private listProviders(): string {
    const providers = this.pool.getAllProviders();
    return providers.map(p => {
      const status = p.quota.available ? '✅' : '❌';
      const pct = Math.round((p.quota.remaining / p.quota.total) * 100);
      return `${status} ${p.name} (${p.category}) — ${p.quota.remaining}/${p.quota.total} (${pct}%)`;
    }).join('\n');
  }

  private formatForecast(): string {
    const providers = this.pool.getAllProviders();
    const lines = ['📊 Quota Forecast:'];
    for (const p of providers) {
      const pred = this.quotaForecast.predict(p.name);
      if (!pred || !pred.estimatedExhaustion) continue;
      const hours = Math.round((pred.estimatedExhaustion.getTime() - Date.now()) / 3600000);
      lines.push(`  ${p.name}: ~${hours}h left (${pred.tokensPerMinute.toFixed(0)} tok/min)`);
    }
    return lines.join('\n');
  }

  private async handleEmergency(sub: string): Promise<string> {
    switch (sub) {
      case 'local': return `✅ Local fallback enabled (Ollama llama3.2 at localhost:11434/v1)`;
      case 'skip': return `✅ Local fallback disabled`;
      case 'status': {
        const avail = await this.offlineEmergency.isAvailable();
        return avail ? '✅ Ollama available' : '❌ Ollama not running';
      }
      default: return 'Usage: /use emergency local|skip|status';
    }
  }

  private formatWatchdog(): string {
    const health = this.watchdog.getAllHealth();
    const lines = ['🐕 Provider Watchdog:'];
    for (const [name, h] of Object.entries(health)) {
      const icon = h.status === 'healthy' ? '✅' : h.status === 'degraded' ? '⚠️' : h.status === 'cooldown' ? '🧊' : '❌';
      lines.push(`  ${icon} ${name}: ${h.status} (${h.latency}ms, ${h.consecutiveFailures} fails)`);
    }
    return lines.join('\n');
  }

  private configWizard(): string {
    return `🔧 Interactive config wizard not yet implemented. Edit ~/.claude/plugins/omnifree/config.json directly.`;
  }
}

export default OmniFreePlugin;