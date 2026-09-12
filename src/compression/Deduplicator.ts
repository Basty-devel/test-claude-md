import { Message } from '../types';
import { Hasher } from '../utils/Hasher';
import { TokenCounter } from '../utils/TokenCounter';

export interface DeduplicationResult {
  deduplicated: Message[];
  stats: { deduplication: number };
  references: Map<string, string>;
}

/**
 * Deduplicator (Compression Layer 1): Detects repeated context blocks across turns,
 * hashes them with SHA-256, and replaces subsequent occurrences with compact
 * [DEDUP:hash8] references to reduce token count.
 *
 * Contract:
 *  - compress(messages: Message[]): DeduplicationResult
 *  - Blocks shorter than MIN_BLOCK_SIZE (50 chars) are never deduplicated.
 *  - The first occurrence of any block is always preserved verbatim.
 *  - Subsequent identical blocks are replaced with [DEDUP:<first-8-hex-chars>].
 *  - Token savings are computed via TokenCounter.estimate().
 *  - Output array length always equals input array length; roles are preserved.
 *  - Empty input returns empty output with zero stats.
 *  - References map tracks all hash->ref mappings encountered during compression.
 */
export class Deduplicator {
  private static readonly MIN_BLOCK_SIZE = 50;

  compress(messages: Message[]): DeduplicationResult {
    if (messages.length === 0) {
      return {
        deduplicated: [],
        stats: { deduplication: 0 },
        references: new Map<string, string>(),
      };
    }

    const references = new Map<string, string>();
    const seen = new Map<string, number>();
    let totalSaved = 0;

    const deduplicated = messages.map((msg, index) => {
      const blocks = this.extractBlocks(msg.content);
      const compressedBlocks = blocks.map(block => {
        if (block.length < Deduplicator.MIN_BLOCK_SIZE) {
          return block;
        }

        const hash = Hasher.hash(block);
        const firstSeenIndex = seen.get(hash);

        if (firstSeenIndex !== undefined && firstSeenIndex < index) {
          const ref = `[DEDUP:${hash.slice(0, 8)}]`;
          references.set(hash, ref);
          totalSaved += TokenCounter.estimate(block) - TokenCounter.estimate(ref);
          return ref;
        }

        seen.set(hash, index);
        return block;
      });

      return { ...msg, content: compressedBlocks.join('') };
    });

    return {
      deduplicated,
      stats: { deduplication: totalSaved },
      references,
    };
  }

  /**
   * Splits content into deduplication blocks.
   * Strategy:
   * 1. First split by code fences (```...```) — code blocks are atomic units.
   * 2. Then split remaining non-code text by paragraph boundaries (blank lines / double newlines).
   * 3. Filter out empty blocks.
   * This ensures repeated paragraphs and code blocks are deduplicated independently,
   * while preserving their original order for reconstruction.
   */
  private extractBlocks(content: string): string[] {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const blocks: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Process text before this code block: split by paragraphs
      const beforeCode = content.slice(lastIndex, match.index);
      const paragraphBlocks = this.splitParagraphs(beforeCode);
      blocks.push(...paragraphBlocks);

      // Add the code block as a single atomic unit
      blocks.push(match[0]);
      lastIndex = match.index + match[0].length;
    }

    // Process remaining text after last code block
    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex);
      const paragraphBlocks = this.splitParagraphs(remaining);
      blocks.push(...paragraphBlocks);
    }

    // Filter out empty blocks
    return blocks.filter(b => b.length > 0);
  }

  /**
   * Splits text by paragraph boundaries (blank lines).
   * Preserves the newline structure so reconstruction is exact.
   */
  private splitParagraphs(text: string): string[] {
    // Split on double newlines (blank lines), keeping the delimiter
    const parts = text.split(/(\n\n+)/);
    const blocks: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.length === 0) continue;
      // If this is a delimiter (newlines), append to previous block
      if (part.match(/^\n\n+$/)) {
        if (blocks.length > 0) {
          blocks[blocks.length - 1] += part;
        } else {
          blocks.push(part);
        }
      } else {
        blocks.push(part);
      }
    }

    return blocks.length > 0 ? blocks : [text];
  }
}