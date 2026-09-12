import { Message } from '../types';
import { TokenCounter } from '../utils/TokenCounter';

export interface TruncationResult {
  truncated: Message[];
  stats: { truncation: number };
}

export class SmartTruncator {
  private static readonly LAST_TURNS = 3;
  private static readonly CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
  private static readonly THRESHOLD = 0.9;

  truncate(messages: Message[], contextWindow: number): TruncationResult {
    if (messages.length === 0) {
      return { truncated: [], stats: { truncation: 0 } };
    }

    const currentTokens = TokenCounter.countMessages(messages);

    if (currentTokens <= contextWindow * SmartTruncator.THRESHOLD) {
      return { truncated: messages, stats: { truncation: 0 } };
    }

    const systemMessages: Message[] = [];
    const conversationMessages: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessages.push(msg);
      } else {
        conversationMessages.push(msg);
      }
    }

    const keepCount = Math.min(
      SmartTruncator.LAST_TURNS * 2,
      conversationMessages.length
    );
    const lastTurns = conversationMessages.slice(-keepCount);
    const middleTurns = conversationMessages.slice(0, -keepCount);

    if (middleTurns.length === 0) {
      return { truncated: messages, stats: { truncation: 0 } };
    }

    const protectedBlocks = this.extractProtectedBlocks(middleTurns);
    const summarizedMiddle = this.summarizeMiddle(middleTurns, protectedBlocks);

    const truncated: Message[] = [
      ...systemMessages,
      ...summarizedMiddle,
      ...lastTurns
    ];

    const tokensSaved = currentTokens - TokenCounter.countMessages(truncated);
    return { truncated, stats: { truncation: tokensSaved } };
  }

  private extractProtectedBlocks(messages: Message[]): string[] {
    const blocks: string[] = [];
    for (const msg of messages) {
      const regex = new RegExp(SmartTruncator.CODE_BLOCK_PATTERN.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(msg.content)) !== null) {
        blocks.push(match[0]);
      }
    }
    return blocks;
  }

  private summarizeMiddle(messages: Message[], protectedBlocks: string[]): Message[] {
    if (messages.length === 0) return [];

    const summaryParts: string[] = [];
    for (const msg of messages) {
      let content = msg.content;
      for (const block of protectedBlocks) {
        content = content.replace(block, '[CODE_BLOCK]');
      }
      const truncated = content.length > 100 ? `${content.slice(0, 100)}...` : content;
      summaryParts.push(`[${msg.role}]: ${truncated}`);
    }

    return [{ role: 'user', content: summaryParts.join('\n') }];
  }
}
