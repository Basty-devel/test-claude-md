import { Pool } from './Pool';
import { RoutingStrategy } from './strategies/PriorityStrategy';
import { ProviderRequest, ProviderResponse } from '../types';

export class Router {
  private pool: Pool;
  private strategy: RoutingStrategy;

  constructor(pool: Pool, strategy: RoutingStrategy) {
    this.pool = pool;
    this.strategy = strategy;
  }

  async route(request: ProviderRequest): Promise<ProviderResponse> {
    const providers = this.pool.getAvailableProviders(request.taskType);

    if (providers.length === 0) {
      throw new Error(`No available providers for ${request.taskType}`);
    }

    const selected = this.strategy.select(providers, request.taskType);
    if (!selected) {
      throw new Error(`Strategy returned no provider for ${request.taskType}`);
    }

    const response = await selected.route(request);
    this.pool.updateQuota(selected.name, response.tokensUsed);
    return response;
  }
}
