import { Message } from '../types';

/**
 * ToolResultCompressor (Compression Layer - Pre-Processor): Greedy all-output
 * collapse applied as the first pipe in the Compressor pipeline.
 *
 * Contract:
 *  - compress(messages: Message[]): { compressed: Message[]; stats: { toolResult: number } }
 *  - Head/tail collapse: messages exceeding HEAD_LINES + TAIL_LINES are collapsed
 *    to head 50 + "[... N lines truncated ...]" + tail 20.
 *  - Code fence protection: content inside ``` fences is never elided.
 *  - Diff hunk detection: context-only hunks beyond per-file cap are elided;
 *    changed hunks (@@ lines, +/- lines) are always kept.
 *  - Test/lint summary: headline + first failure kept, repeated PASS lines elided.
 *  - Error line preservation: lines matching error patterns are never elided.
 *  - Policy is deterministic (no LLM call).
 *  - Empty input returns empty output with zero stats.
 *  - Output array length equals input array length; roles are preserved.
 */
export class ToolResultCompressor {
  private static readonly HEAD_LINES = 50;
  private static readonly TAIL_LINES = 20;
  private static readonly CONTEXT_HUNK_CAP = 10;
  private static readonly TEST_PASS_CAP = 5;

  private static readonly ERROR_PATTERNS: RegExp[] = [
    /^Error[:\s]/im,
    /^TypeError[:\s]/im,
    /^FATAL[:\s]/im,
    /^FAIL[:\s]/im,
    /ECONNREFUSED/,
    /ENOENT/,
    /EACCES/,
    /ETIMEDOUT/,
    /ENOTFOUND/,
  ];

  compress(messages: Message[]): { compressed: Message[]; stats: { toolResult: number } } {
    if (messages.length === 0) {
      return { compressed: [], stats: { toolResult: 0 } };
    }

    let totalSaved = 0;
    const compressed = messages.map((msg) => {
      const result = this.compressMessage(msg);
      totalSaved += result.saved;
      return result.message;
    });

    return { compressed, stats: { toolResult: totalSaved } };
  }

  private compressMessage(msg: Message): { message: Message; saved: number } {
    const content = msg.content;
    const lines = content.split('\n');

    // Code fence protection: if the content is entirely within ``` fences, skip
    if (ToolResultCompressor.isFullyFenced(content)) {
      return { message: msg, saved: 0 };
    }

    // Try detectors in order; first match wins
    const diffResult = ToolResultCompressor.detectDiffHunks(lines);
    if (diffResult.applied) {
      const collapsed = diffResult.lines.join('\n');
      return { message: { ...msg, content: collapsed }, saved: content.length - collapsed.length };
    }

    const testResult = ToolResultCompressor.detectTestSummary(lines);
    if (testResult.applied) {
      const collapsed = testResult.lines.join('\n');
      return { message: { ...msg, content: collapsed }, saved: content.length - collapsed.length };
    }

    // Error line preservation: check if there are error lines
    const hasErrors = lines.some((l) =>
      ToolResultCompressor.ERROR_PATTERNS.some((p) => p.test(l))
    );

    // Generic large output collapse (head/tail)
    if (lines.length > ToolResultCompressor.HEAD_LINES + ToolResultCompressor.TAIL_LINES) {
      if (hasErrors) {
        // With errors, do head/tail but ensure error lines survive
        return ToolResultCompressor.collapseHeadTailPreservingErrors(msg, lines);
      }
      return ToolResultCompressor.collapseHeadTail(msg, lines);
    }

    return { message: msg, saved: 0 };
  }

  /**
   * Detects whether content is entirely wrapped in a single code fence block.
   */
  private static isFullyFenced(content: string): boolean {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('```')) return false;
    const firstFenceEnd = trimmed.indexOf('\n');
    if (firstFenceEnd === -1) return false;
    const rest = trimmed.slice(firstFenceEnd + 1);
    const lastFenceIdx = rest.lastIndexOf('```');
    if (lastFenceIdx === -1) return false;
    const afterLastFence = rest.slice(lastFenceIdx + 3).trim();
    return afterLastFence.length === 0;
  }

  /**
   * Diff hunk detector: keeps changed hunks (lines with @@, +, -) verbatim,
   * collapses context-only hunks beyond CONTEXT_HUNK_CAP.
   */
  private static detectDiffHunks(lines: string[]): { applied: boolean; lines: string[] } {
    const hasHunkHeader = lines.some((l) => l.startsWith('@@'));
    if (!hasHunkHeader) return { applied: false, lines };

    const result: string[] = [];
    let contextCount = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('@@')) {
        // Collect the hunk
        const hunk: string[] = [line];
        i++;
        while (i < lines.length && !lines[i].startsWith('@@')) {
          hunk.push(lines[i]);
          i++;
        }
        const isChanged = hunk.some((l) => l.startsWith('+') || l.startsWith('-'));
        if (isChanged) {
          result.push(...hunk);
        } else {
          contextCount++;
          if (contextCount <= ToolResultCompressor.CONTEXT_HUNK_CAP) {
            result.push(...hunk);
          } else {
            result.push(`[… context hunk ${contextCount} omitted …]`);
          }
        }
      } else {
        result.push(line);
        i++;
      }
    }

    const original = lines.join('\n');
    const collapsed = result.join('\n');
    return { applied: original !== collapsed, lines: result };
  }

  /**
   * Test/lint summary detector: keeps headline + first failure, collapses
   * repeated PASS lines beyond TEST_PASS_CAP.
   */
  private static detectTestSummary(lines: string[]): { applied: boolean; lines: string[] } {
    const hasTestFileLine = lines.some(
      (l) => l.includes('Test Files') || l.includes('Tests ') || l.includes('passed') || l.includes('failed')
    );
    if (!hasTestFileLine) return { applied: false, lines };

    const result: string[] = [];
    let passCount = 0;
    let collapsed = false;

    for (const line of lines) {
      const isPassLine =
        line.trim().startsWith('PASS') || (line.includes('.test.') && !line.includes('FAIL'));

      if (isPassLine) {
        passCount++;
        if (passCount <= ToolResultCompressor.TEST_PASS_CAP) {
          result.push(line);
        } else {
          collapsed = true;
          // Elide repeated pass lines
        }
      } else {
        result.push(line);
      }
    }

    if (collapsed) {
      result.push(`[… ${passCount - ToolResultCompressor.TEST_PASS_CAP} passing tests omitted …]`);
    }

    return { applied: collapsed, lines: result };
  }

  /**
   * Finds all code fence regions (``` ... ```) in the content.
   * Returns array of { start, end } line indices (inclusive).
   */
  private static findCodeFenceRegions(lines: string[]): Array<{ start: number; end: number }> {
    const regions: Array<{ start: number; end: number }> = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].trimStart().startsWith('```')) {
        const start = i;
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
          i++;
        }
        if (i < lines.length) {
          regions.push({ start, end: i });
          i++;
        } else {
          // Unclosed fence - treat as code from start to end
          regions.push({ start, end: lines.length - 1 });
          break;
        }
      } else {
        i++;
      }
    }
    return regions;
  }

  /**
   * Generic head/tail collapse for large outputs.
   * Preserves code fences intact by adjusting head/tail boundaries.
   */
  private static collapseHeadTail(msg: Message, lines: string[]): { message: Message; saved: number } {
    const fenceRegions = ToolResultCompressor.findCodeFenceRegions(lines);

    let headEnd = ToolResultCompressor.HEAD_LINES;
    let tailStart = lines.length - ToolResultCompressor.TAIL_LINES;

    // Adjust boundaries to avoid cutting into code fences
    for (const region of fenceRegions) {
      // If head boundary cuts into a fence, extend head past the fence end
      if (headEnd > region.start && headEnd <= region.end) {
        headEnd = region.end + 1;
      }
      // If tail boundary cuts into a fence, shrink tail past the fence start
      if (tailStart > region.start && tailStart <= region.end) {
        tailStart = region.start;
      }
    }

    // Ensure head + tail don't overlap
    if (headEnd >= tailStart) {
      headEnd = Math.floor((tailStart) / 2);
    }

    const head = lines.slice(0, headEnd);
    const tail = lines.slice(tailStart);
    const omitted = lines.length - head.length - tail.length;
    const collapsed = `${head.join('\n')}\n[… ${omitted} lines truncated …]\n${tail.join('\n')}`;
    return {
      message: { ...msg, content: collapsed },
      saved: msg.content.length - collapsed.length,
    };
  }

  /**
   * Head/tail collapse that ensures error lines are never elided mid-line.
   * Error lines found in the omitted region are appended after the tail cap.
   */
  private static collapseHeadTailPreservingErrors(
    msg: Message,
    lines: string[]
  ): { message: Message; saved: number } {
    const head = lines.slice(0, ToolResultCompressor.HEAD_LINES);
    const tail = lines.slice(-ToolResultCompressor.TAIL_LINES);
    const omitted = lines.slice(
      ToolResultCompressor.HEAD_LINES,
      lines.length - ToolResultCompressor.TAIL_LINES
    );

    // Find error lines in the omitted section
    const preservedErrors = omitted.filter((l) =>
      ToolResultCompressor.ERROR_PATTERNS.some((p) => p.test(l))
    );

    const omittedCount = omitted.length - preservedErrors.length;
    const parts: string[] = [head.join('\n')];

    if (omittedCount > 0) {
      parts.push(`[… ${omittedCount} lines truncated …]`);
    }

    if (preservedErrors.length > 0) {
      parts.push(preservedErrors.join('\n'));
    }

    parts.push(tail.join('\n'));

    const collapsed = parts.join('\n');
    return {
      message: { ...msg, content: collapsed },
      saved: msg.content.length - collapsed.length,
    };
  }
}
