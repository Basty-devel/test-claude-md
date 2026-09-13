/**
 * CostDashboard — tracks session token usage and estimated savings vs paid API.
 * Pricing: Sonnet $3/1M input, $15/1M output.
 */
export interface CostEntry {
  provider: string;
  tokens: number;
  timestamp: Date;
}

export class CostDashboard {
  private static readonly SONNET_INPUT_PRICE = 3 / 1_000_000;
  private static readonly SONNET_OUTPUT_PRICE = 15 / 1_000_000;
  private static readonly AVG_OUTPUT_RATIO = 0.3; // assume 30% output tokens

  private usage: CostEntry[] = [];

  /**
   * Record token usage for a provider.
   */
  record(provider: string, tokens: number): void {
    this.usage.push({ provider, tokens, timestamp: new Date() });
  }

  /**
   * Get aggregated session stats.
   */
  getSessionStats(): {
    totalTokens: number;
    estimatedSavings: number;
    breakdown: Record<string, number>;
  } {
    const totalTokens = this.usage.reduce((sum, e) => sum + e.tokens, 0);
    const breakdown: Record<string, number> = {};

    for (const entry of this.usage) {
      breakdown[entry.provider] = (breakdown[entry.provider] ?? 0) + entry.tokens;
    }

    // Estimate savings vs Sonnet API
    const estimatedSavings = totalTokens * (
      CostDashboard.SONNET_INPUT_PRICE * (1 - CostDashboard.AVG_OUTPUT_RATIO) +
      CostDashboard.SONNET_OUTPUT_PRICE * CostDashboard.AVG_OUTPUT_RATIO
    );

    return { totalTokens, estimatedSavings, breakdown };
  }

  /**
   * Format a human-readable cost summary.
   */
  format(): string {
    const stats = this.getSessionStats();
    const lines = [
      '💰 Session Cost Dashboard:',
      `  Tokens used: ${stats.totalTokens.toLocaleString()}`,
      '',
      '  Provider breakdown:',
    ];

    for (const [provider, tokens] of Object.entries(stats.breakdown)) {
      const percent = Math.round((tokens / stats.totalTokens) * 100);
      lines.push(`    ${provider}: ${tokens.toLocaleString()} (${percent}%)`);
    }

    lines.push('');
    lines.push(`  Estimated savings: $${stats.estimatedSavings.toFixed(2)} vs Claude Sonnet API`);
    lines.push(`  (Based on $3/1M input + $15/1M output pricing)`);

    return lines.join('\n');
  }

  /**
   * Clear recorded usage.
   */
  reset(): void {
    this.usage = [];
  }
}