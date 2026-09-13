import { Message, CompressionStats } from '../types';
import { ToolResultCompressor } from './ToolResultCompressor';
import { Deduplicator } from './Deduplicator';
import { SemanticCompressor } from './SemanticCompressor';
import { SmartTruncator } from './SmartTruncator';
import { PromptPruner } from './PromptPruner';
import { CachePin } from '../router/CachePin';

export interface CompressionResult {
  compressed: Message[];
  stats: CompressionStats;
  explain?: Record<string, string>;
}

/**
 * Compressor (Main Orchestrator): Chains compression layers at configurable levels.
 *
 * Level 0: No compression - messages returned as-is.
 * Level 1: Deduplication + Semantic compression (no truncation).
 * Level 2: All existing layers (dedup + semantic + truncation) + ToolResult collapse (first pipe).
 * Level 3: All Level 2 layers + ToolResult + PromptPruner + CachePin (opt-in).
 *
 * Contract:
 *  - compress(messages: Message[], level: 0 | 1 | 2 | 3, contextWindow: number): CompressionResult
 *  - Empty input returns empty output with zero stats at any level.
 *  - Percentage is computed against the original token count (character/4 estimate).
 *  - Stats breakdown always sums to totalSaved.
 *  - ToolResultCompressor runs as the FIRST pipe at level >= 2 (before dedup).
 */
export class Compressor {
  private toolResultCompressor = new ToolResultCompressor();
  private deduplicator = new Deduplicator();
  private semanticCompressor = new SemanticCompressor();
  private smartTruncator = new SmartTruncator();
  private promptPruner = new PromptPruner();
  private cachePin = new CachePin();

  compress(messages: Message[], level: 0 | 1 | 2 | 3, contextWindow: number): CompressionResult {
    if (level === 0) {
      return { compressed: messages, stats: this.emptyStats(), explain: {} };
    }

    if (messages.length === 0) {
      return { compressed: [], stats: this.emptyStats(), explain: {} };
    }

    let current = messages;
    const stats: CompressionStats = {
      totalSaved: 0,
      percentage: 0,
      deduplication: 0,
      semantic: 0,
      truncation: 0,
      toolResult: 0,
      pruning: 0,
      cache: 0,
    };
    const explain: Record<string, string> = {};

    // Level >= 2: ToolResultCompressor runs FIRST (greedy collapse before dedup)
    if (level >= 2) {
      const toolResult = this.toolResultCompressor.compress(current);
      current = toolResult.compressed;
      stats.toolResult = toolResult.stats.toolResult;
      stats.totalSaved += toolResult.stats.toolResult;
      explain.toolResult = `Collapsed tool output: saved ${toolResult.stats.toolResult} chars`;
    }

    // Level == 3: PromptPruner lightweight importance scoring + threshold rerun
    if (level === 3) {
      const pruneResult = this.promptPruner.prune(current);
      current = pruneResult.pruned;
      stats.pruning = pruneResult.stats.pruned;
      stats.totalSaved += pruneResult.stats.pruned;
      explain.pruning = `Pruned low-importance lines: saved ${pruneResult.stats.pruned} chars`;
    }

    if (level >= 1) {
      const dedupResult = this.deduplicator.compress(current);
      current = dedupResult.deduplicated;
      stats.deduplication = dedupResult.stats.deduplication;
      stats.totalSaved += dedupResult.stats.deduplication;

      const semanticResult = this.semanticCompressor.compress(current);
      current = semanticResult.compressed;
      stats.semantic = semanticResult.stats.semantic;
      stats.totalSaved += semanticResult.stats.semantic;
    }

    if (level >= 2) {
      const truncationResult = this.smartTruncator.truncate(current, contextWindow);
      current = truncationResult.truncated;
      stats.truncation = truncationResult.stats.truncation;
      stats.totalSaved += truncationResult.stats.truncation;
    }

    // Level == 3: CachePin — advisory pin for KV-cache hit maximization
    if (level === 3) {
      this.cachePin.forMessages(current);
      stats.cache = 0; // CachePin does not reduce tokens; it pins for provider cache
      explain.cache = `CachePin applied: ${this.cachePin.pin.slice(0, 8)}…`;
    }

    const originalTokens = this.countTokens(messages);
    stats.percentage = originalTokens > 0 ? (stats.totalSaved / originalTokens) * 100 : 0;

    return { compressed: current, stats, explain };
  }

  private countTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
  }

  private emptyStats(): CompressionStats {
    return {
      totalSaved: 0,
      percentage: 0,
      deduplication: 0,
      semantic: 0,
      truncation: 0,
      toolResult: 0,
      pruning: 0,
      cache: 0,
    };
  }
}
