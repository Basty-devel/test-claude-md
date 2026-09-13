import { Pool } from '../router/Pool';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'cooldown';

export interface ProviderHealth {
  status: HealthStatus;
  latency: number;
  lastCheck: Date;
  consecutiveFailures: number;
  cooldownUntil?: Date;
}

/**
 * ProviderWatchdog — background health checks every 15 minutes.
 * Auto-cooldown on 3+ consecutive failures.
 */
export class ProviderWatchdog {
  private pool: Pool;
  private health: Map<string, ProviderHealth> = new Map();
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Start periodic health checks (default 15 min interval).
   */
  start(intervalMs = 15 * 60 * 1000): void {
    this.intervalId = setInterval(() => this.checkAll(), intervalMs);
    this.checkAll();
  }

  /**
   * Stop the watchdog.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Check health of all providers.
   */
  async checkAll(): Promise<void> {
    const providers = this.pool.getAllProviders();

    for (const provider of providers) {
      const start = Date.now();
      const healthy = await provider.healthCheck();
      const latency = Date.now() - start;

      const previous = this.health.get(provider.name);
      const consecutiveFailures = healthy ? 0 : (previous?.consecutiveFailures ?? 0) + 1;

      this.health.set(provider.name, {
        status: this.determineStatus(healthy, latency, consecutiveFailures),
        latency,
        lastCheck: new Date(),
        consecutiveFailures,
        cooldownUntil: consecutiveFailures >= 3
          ? new Date(Date.now() + consecutiveFailures * 60000)
          : undefined,
      });
    }
  }

  /**
   * Get health status for a provider.
   */
  getHealth(providerName: string): ProviderHealth | undefined {
    return this.health.get(providerName);
  }

  /**
   * Get health for all providers.
   */
  getAllHealth(): Record<string, ProviderHealth> {
    return Object.fromEntries(this.health);
  }

  private determineStatus(healthy: boolean, latency: number, failures: number): HealthStatus {
    if (failures >= 3) return 'cooldown';
    if (!healthy) return 'down';
    if (latency > 5000) return 'degraded';
    return 'healthy';
  }
}