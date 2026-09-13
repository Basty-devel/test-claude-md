import { Pool } from './Pool';
import { RoutingStrategy } from './strategies/PriorityStrategy';
import { ProviderRequest, ProviderResponse } from '../types';

export interface RouteOptions {
  /** Advisory cache pin from CachePin.forMessages(). */
  cachePin?: string;
}

export class Router {
  private pool: Pool;
  private strategy: RoutingStrategy;

  constructor(pool: Pool, strategy: RoutingStrategy) {
    this.pool = pool;
    this.strategy = strategy;
  }

  async route(request: ProviderRequest, options?: RouteOptions): Promise<ProviderResponse> {
    const providers = this.pool.getAvailableProviders(request.taskType);

    if (providers.length === 0) {
      throw new Error(`No available providers for ${request.taskType}`);
    }

    const selected = this.strategy.select(providers, request.taskType);
    if (!selected) {
      throw new Error(`Strategy returned no provider for ${request.taskType}`);
    }

    // Advisory CachePin tie-break: if a cachePin is provided and the
    // strategy-selected provider is not the preferred one, swap to the
    // preferred provider only when it is among available candidates.
    let chosen = selected;
    if (options?.cachePin) {
      const preferredName = this.pool.preferredFor(options.cachePin);
      if (preferredName) {
        const preferred = providers.find(p => p.name === preferredName);
        if (preferred) {
          chosen = preferred;
        }
      }
    }

    const response = await chosen.route(request);
    this.pool.updateQuota(chosen.name, response.tokensUsed);

    // Record the pin after a successful route.
    if (options?.cachePin) {
      this.pool.recordPin(options.cachePin, chosen.name);
    }

    const result: ProviderResponse & { cachePinHeader?: Record<string, string> } = { ...response };
    if (options?.cachePin) {
      result.cachePinHeader = { 'x-omnifree-cache-pin': options.cachePin };
    }
    return result;
  }
}
