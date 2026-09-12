import { Pool } from '../router/Pool';

export interface Prediction {
  provider: string;
  remainingTokens: number;
  tokensPerMinute: number;
  estimatedExhaustion: Date | null;
}

export class QuotaForecast {
  private pool: Pool;
  private usageHistory: Map<string, { timestamp: number; tokens: number }[]> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  recordUsage(providerName: string, tokens: number): void {
    const history = this.usageHistory.get(providerName) || [];
    history.push({ timestamp: Date.now(), tokens });
    this.usageHistory.set(providerName, history);
  }

  predict(providerName: string): Prediction | null {
    const provider = this.pool.getByName(providerName);
    if (!provider) return null;

    const history = this.usageHistory.get(providerName) || [];
    const tokensPerMinute = this.calculateRate(history);

    const estimatedExhaustion = tokensPerMinute > 0
      ? new Date(Date.now() + (provider.quota.remaining / tokensPerMinute) * 60000)
      : null;

    return {
      provider: providerName,
      remainingTokens: provider.quota.remaining,
      tokensPerMinute,
      estimatedExhaustion
    };
  }

  private calculateRate(history: { timestamp: number; tokens: number }[]): number {
    if (history.length < 2) return 0;

    const recent = history.slice(-10);
    const timeSpan = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 60000;
    const tokensUsed = recent.reduce((sum, h) => sum + h.tokens, 0);

    return timeSpan > 0 ? tokensUsed / timeSpan : 0;
  }
}
