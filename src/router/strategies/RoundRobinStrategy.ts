import { ProviderAdapter } from '../../providers/ProviderAdapter';
import { RoutingStrategy } from './PriorityStrategy';

export class RoundRobinStrategy implements RoutingStrategy {
  private pointer = 0;

  select(providers: ProviderAdapter[], _taskType: string): ProviderAdapter | null {
    const available = providers.filter(p => p.quota.available);
    if (available.length === 0) return null;

    this.pointer = this.pointer % available.length;
    const selected = available[this.pointer];
    this.pointer = (this.pointer + 1) % available.length;
    return selected;
  }
}
