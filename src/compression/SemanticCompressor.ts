import { Message } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export interface SemanticResult {
  compressed: Message[];
  stats: { semantic: number };
}

export class SemanticCompressor {
  private static readonly FILLER_PHRASES = [
    /^(I understand[^.!?]*[.!?]\s*)/i,
    /^(Let me help you[^.!?]*[.!?]\s*)/i,
    /^(I can see that[^.!?]*[.!?]\s*)/i,
    /^(Based on your description[^.!?]*[.!?]\s*)/i,
    /^(Here is the solution[^.!?]*[.!?]\s*)/i,
    /^(The issue is[^.!?]*[.!?]\s*)/i
  ];

  private static readonly PATH_REGEX = /^(\/[\w/]+\.\w+)$/gm;

  compress(messages: Message[]): SemanticResult {
    let totalSaved = 0;

    const compressed = messages.map(msg => {
      let content = msg.content;

      // Process outside code blocks only
      content = this.processOutsideCodeBlocks(content, (text) => {
        let processed = text;
        // Remove filler phrases
        for (const pattern of SemanticCompressor.FILLER_PHRASES) {
          const before = processed;
          processed = processed.replace(pattern, '');
          totalSaved += TokenCounter.estimate(before) - TokenCounter.estimate(processed);
        }

        // Strip repeated file paths (remove all occurrences of any path that appears more than once)
        const paths = processed.match(SemanticCompressor.PATH_REGEX) || [];
        if (paths.length > 1) {
          const counts = new Map<string, number>();
          for (const p of paths) {
            counts.set(p, (counts.get(p) || 0) + 1);
          }
          const duplicatedPaths = new Set(paths.filter((p) => counts.get(p)! > 1));
          if (duplicatedPaths.size > 0) {
            processed = processed.replace(SemanticCompressor.PATH_REGEX, (match) => {
              return duplicatedPaths.has(match) ? '' : match;
            });
          }
        }

        return processed;
      });

      return { ...msg, content };
    });

    return {
      compressed,
      stats: { semantic: totalSaved }
    };
  }

  private processOutsideCodeBlocks(text: string, processor: (text: string) => string): string {
    // Match code blocks with language identifier (```lang) - preserve these
    // Match plain code blocks (```) - process for boilerplate stripping
    const codeBlockRegex = /```(\w+)?[\s\S]*?```/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block (process it)
      const beforeCode = text.slice(lastIndex, match.index);
      parts.push(processor(beforeCode));

      // Check if code block has language identifier
      const hasLanguage = match[1] && match[1].length > 0;
      if (hasLanguage) {
        // Preserve language-tagged code blocks verbatim
        parts.push(match[0]);
      } else {
        // Process plain code blocks for boilerplate stripping
        parts.push(processor(match[0]));
      }
      lastIndex = match.index + match[0].length;
    }

    // Process remaining text after last code block
    const afterCode = text.slice(lastIndex);
    parts.push(processor(afterCode));

    return parts.join('');
  }
}
