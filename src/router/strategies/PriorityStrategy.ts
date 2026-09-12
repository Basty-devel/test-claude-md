import { ProviderAdapter } from '../../providers/ProviderAdapter';

export interface RoutingStrategy {
  select(providers: ProviderAdapter[], taskType: string): ProviderAdapter | null;
}

export class PriorityStrategy implements RoutingStrategy {
  private priorities: Map<string, number> = new Map();

  setPriority(providerName: string, priority: number): void {
    this.priorities.set(providerName, priority);
  }

  select(providers: ProviderAdapter[], _taskType: string): ProviderAdapter | null {
    const available = providers.filter(p => p.quota.available);
    if (available.length === 0) return null;

    return available.reduce((best, current) => {
      const bestPriority = this.priorities.get(best.name) || 0;
      const currentPriority = this.priorities.get(current.name) || 0;
      return currentPriority > bestPriority ? current : best;
    });
  }
}
