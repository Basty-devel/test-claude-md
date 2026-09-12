import { Message, CompressionStats } from '../types';
import { Deduplicator } from './Deduplicator';
import { SemanticCompressor } from './SemanticCompressor';
import { SmartTruncator } from './SmartTruncator';

export interface CompressionResult {
  compressed: Message[];
  stats: CompressionStats;
}

/**
 * Compressor (Main Orchestrator): Chains the three compression layers
 * (Deduplicator, SemanticCompressor, SmartTruncator) at configurable levels.
 *
 * Level 0: No compression — messages returned as-is.
 * Level 1: Deduplication + Semantic compression (no truncation).
 * Level 2: All three layers (dedup + semantic + truncation).
 *
 * Contract:
 *  - compress(messages: Message[], level: 0 | 1 | 2, contextWindow: number): CompressionResult
 *  - Empty input returns empty output with zero stats at any level.
 *  - Percentage is computed against the original token count (character/4 estimate).
 *  - Stats breakdown always sums to totalSaved.
 */
export class Compressor {
  private deduplicator = new Deduplicator();
  private semanticCompressor = new SemanticCompressor();
  private smartTruncator = new SmartTruncator();

  compress(messages: Message[], level: 0 | 1 | 2, contextWindow: number): CompressionResult {
    if (level === 0) {
      return { compressed: messages, stats: this.emptyStats() };
    }

    if (messages.length === 0) {
      return { compressed: [], stats: this.emptyStats() };
    }

    let current = messages;
    const stats: CompressionStats = {
      totalSaved: 0,
      percentage: 0,
      breakdown: { deduplication: 0, semantic: 0, truncation: 0 },
    };

    if (level >= 1) {
      const dedupResult = this.deduplicator.compress(current);
      current = dedupResult.deduplicated;
      stats.breakdown.deduplication = dedupResult.stats.deduplication;
      stats.totalSaved += dedupResult.stats.deduplication;

      const semanticResult = this.semanticCompressor.compress(current);
      current = semanticResult.compressed;
      stats.breakdown.semantic = semanticResult.stats.semantic;
      stats.totalSaved += semanticResult.stats.semantic;
    }

    if (level >= 2) {
      const truncationResult = this.smartTruncator.truncate(current, contextWindow);
      current = truncationResult.truncated;
      stats.breakdown.truncation = truncationResult.stats.truncation;
      stats.totalSaved += truncationResult.stats.truncation;
    }

    const originalTokens = this.countTokens(messages);
    stats.percentage = originalTokens > 0 ? (stats.totalSaved / originalTokens) * 100 : 0;

    return { compressed: current, stats };
  }

  private countTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
  }

  private emptyStats(): CompressionStats {
    return {
      totalSaved: 0,
      percentage: 0,
      breakdown: { deduplication: 0, semantic: 0, truncation: 0 },
    };
  }
}
