import { ProviderAdapter } from '../providers/ProviderAdapter';

export type ProviderCategory = 'chat' | 'code' | 'image';

export class Pool {
  private providers: Map<string, ProviderAdapter> = new Map();

  /**
   * Add a provider to the pool. If a provider with the same name already exists,
   * it is replaced. Provider name is the unique key.
   *
   * @param provider - The provider adapter to add.
   */
  add(provider: ProviderAdapter): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Remove a provider by name. No-op if no provider with that name exists.
   *
   * @param name - The unique name of the provider to remove.
   */
  remove(name: string): void {
    this.providers.delete(name);
  }

  /**
   * Retrieve a provider by its unique name.
   *
   * @param name - The unique name of the provider.
   * @returns The provider if found, otherwise undefined.
   */
  getByName(name: string): ProviderAdapter | undefined {
    return this.providers.get(name);
  }

  /**
   * Retrieve all providers in the pool that belong to the given category.
   *
   * @param category - One of 'chat', 'code', or 'image'.
   * @returns A new array containing matching providers.
   */
  getProviders(category: ProviderCategory): ProviderAdapter[] {
    return Array.from(this.providers.values()).filter(p => p.category === category);
  }

  /**
   * Retrieve all providers in the given category that are currently available
   * (i.e., their quota.available flag is true).
   *
   * @param category - One of 'chat', 'code', or 'image'.
   * @returns A new array containing available providers in the category.
   */
  getAvailableProviders(category: ProviderCategory): ProviderAdapter[] {
    return this.getProviders(category).filter(p => p.quota.available);
  }

  /**
   * Retrieve every provider registered in the pool, regardless of category.
   *
   * @returns A new array containing all providers.
   */
  getAllProviders(): ProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  /**
   * Deduct tokens used from a provider's remaining quota. If remaining drops
   * to zero or below, the provider is marked unavailable (quota.available = false).
   * No-op if no provider with the given name exists.
   *
   * @param name - The unique name of the provider.
   * @param tokensUsed - The number of tokens to deduct from remaining quota.
   */
  updateQuota(name: string, tokensUsed: number): void {
    const provider = this.providers.get(name);
    if (provider) {
      provider.quota.remaining -= tokensUsed;
      if (provider.quota.remaining <= 0) {
        provider.quota.remaining = 0;
        provider.quota.available = false;
      }
    }
  }
}
