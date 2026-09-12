import { ProviderAdapter } from '../../providers/ProviderAdapter';
import { RoutingStrategy } from './PriorityStrategy';

export class CostOptimizedStrategy implements RoutingStrategy {
  private weights: Map<string, number> = new Map();

  setWeight(providerName: string, weight: number): void {
    this.weights.set(providerName, weight);
  }

  select(providers: ProviderAdapter[], _taskType: string): ProviderAdapter | null {
    const available = providers.filter(p => p.quota.available);
    if (available.length === 0) return null;

    return available.reduce((best, current) => {
      const bestScore = this.calculateScore(best);
      const currentScore = this.calculateScore(current);
      return currentScore >= bestScore ? current : best;
    });
  }

  private calculateScore(provider: ProviderAdapter): number {
    const weight = this.weights.get(provider.name) || 1.0;
    const quotaRatio = provider.quota.remaining / provider.quota.total;
    const latencyBonus = 1.0;
    return weight * quotaRatio * latencyBonus;
  }
}
