import { Message } from '../types';

export interface PruneResult {
  pruned: Message[];
  stats: { pruned: number };
}

interface ScorableLine {
  lineIdx: number;
  score: number;
}

/**
 * PromptPruner (Compression Layer): Lightweight token-importance scoring
 * that keeps ~70% of user-message lines by score, skipping code fences.
 *
 * Contract:
 *  - prune(messages: Message[]): PruneResult
 *  - Only user messages are scored; system and assistant messages pass through unchanged.
 *  - Lines inside ``` code fences are never pruned; blank lines are never pruned.
 *  - Scoring signals: uppercase-start length, quoted paths/technical tokens,
 *    positional weight (first 200 chars), word diversity, specific action words.
 *  - Keep ratio: bottom (1 - KEEP_RATIO) fraction of scorable lines are removed.
 *  - Threshold rerun: if char-per-token (content.length / ceil(content.length/4))
 *    drifts outside the 3.5-5.0 band, threshold is stepped down -5pp and pruning
 *    is retried (up to 3 reruns) to recover content.
 *  - Flat/skip: nothing scorable (pure code, empty content) => returned unchanged.
 *  - Empty input => empty output, zero stats.
 *  - Output array length equals input array length; roles are preserved.
 */
export class PromptPruner {
  private static readonly KEEP_RATIO = 0.7;
  private static readonly MAX_RERUNS = 3;
  private static readonly THRESHOLD_STEP_PP = 0.05;
  private static readonly DRIFT_LOW = 3.5;
  private static readonly DRIFT_HIGH = 5.0;
  private static readonly POSITIONAL_WINDOW = 200;
  private static readonly MIN_CONTENT_LENGTH = 20;

  prune(messages: Message[]): PruneResult {
    if (messages.length === 0) {
      return { pruned: [], stats: { pruned: 0 } };
    }

    const pruned = messages.map((msg) => ({ ...msg }));
    let totalPruned = 0;

    for (let i = 0; i < pruned.length; i++) {
      const msg = pruned[i];
      if (msg.role !== 'user') continue;
      if (msg.content.length < PromptPruner.MIN_CONTENT_LENGTH) continue;

      const result = this.pruneUserContent(msg.content);
      pruned[i] = { ...msg, content: result.content };
      totalPruned += result.prunedChars;
    }

    return { pruned, stats: { pruned: totalPruned } };
  }

  private pruneUserContent(content: string): { content: string; prunedChars: number } {
    const lines = content.split('\n');
    const fenceRanges = PromptPruner.extractFences(lines);

    const scorable: ScorableLine[] = [];
    let charOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const inFence = fenceRanges.some((r) => i >= r.start && i <= r.end);
      if (inFence || trimmed.length === 0) {
        charOffset += lines[i].length + 1;
        continue;
      }
      scorable.push({ lineIdx: i, score: this.scoreLine(trimmed, charOffset) });
      charOffset += lines[i].length + 1;
    }

    if (scorable.length <= 1) {
      return { content, prunedChars: 0 };
    }

    let thresholdPct = 1 - PromptPruner.KEEP_RATIO;
    let best = PromptPruner.applyPrune(lines, scorable, thresholdPct);

    for (let rerun = 0; rerun < PromptPruner.MAX_RERUNS; rerun++) {
      const cpr = PromptPruner.charPerToken(best.content);
      if (cpr >= PromptPruner.DRIFT_LOW && cpr <= PromptPruner.DRIFT_HIGH) {
        break;
      }
      thresholdPct = Math.max(0, thresholdPct - PromptPruner.THRESHOLD_STEP_PP);
      const candidate = PromptPruner.applyPrune(lines, scorable, thresholdPct);
      // Fewer chars pruned than current best => rerun would over-recover; stop.
      if (candidate.prunedChars <= best.prunedChars) {
        break;
      }
      best = candidate;
    }

    // Accept only when drift is back inside the band; otherwise leave untouched.
    const finalCpr = PromptPruner.charPerToken(best.content);
    if (finalCpr >= PromptPruner.DRIFT_LOW && finalCpr <= PromptPruner.DRIFT_HIGH) {
      return best;
    }

    return { content, prunedChars: 0 };
  }

  private scoreLine(trimmed: string, charOffset: number): number {
    let score = 0.3;

    if (trimmed.length > 1 && /^[A-Z]/.test(trimmed)) {
      score += 0.1;
    }

    // Quoted paths, identifiers, or all-caps markers
    if (/[`"'][\w./\\]+[`"']/.test(trimmed) || /\b[A-Z]{2,}\b/.test(trimmed)) {
      score += 0.2;
    }

    if (charOffset < PromptPruner.POSITIONAL_WINDOW) {
      score += 0.1;
    }

    // Word diversity: low unique-word ratio signals repetitive filler
    const words = trimmed.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (words.length > 0) {
      score += (new Set(words).size / words.length) * 0.3;
    }

    // Specificity: concrete action/technical words boost importance
    const specific = trimmed.match(
      /\b(deploy|hotfix|error|fix|urgent|important|critical|api|config|init|return)\b/gi
    );
    if (specific && specific.length > 0) {
      score += 0.15;
    }

    return Math.max(0, Math.min(1.0, score));
  }

  private static extractFences(lines: string[]): Array<{ start: number; end: number }> {
    const fenceRanges: Array<{ start: number; end: number }> = [];
    let inFence = false;
    let fenceStart = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('```')) {
        if (!inFence) {
          inFence = true;
          fenceStart = i;
        } else {
          fenceRanges.push({ start: fenceStart, end: i });
          inFence = false;
        }
      }
    }

    return fenceRanges;
  }

  private static applyPrune(
    lines: string[],
    scorable: ScorableLine[],
    thresholdPct: number
  ): { content: string; prunedChars: number } {
    if (thresholdPct <= 0) {
      const content = lines.join('\n');
      return { content, prunedChars: 0 };
    }

    const pruneCount = Math.max(1, Math.round(thresholdPct * scorable.length));
    const sorted = [...scorable].sort((a, b) => a.score - b.score);
    const pruneSet = new Set(sorted.slice(0, pruneCount).map((s) => s.lineIdx));

    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (pruneSet.has(i)) {
        continue;
      }
      kept.push(lines[i]);
    }

    const originalLength = lines.join('\n').length;
    const content = kept.join('\n');
    return { content, prunedChars: originalLength - content.length };
  }

  private static charPerToken(content: string): number {
    const tokens = Math.ceil(content.length / 4);
    return tokens > 0 ? content.length / tokens : 4;
  }
}