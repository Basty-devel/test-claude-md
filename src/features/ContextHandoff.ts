import { Message, CodeBlock, ContextHandoff as ContextHandoffType } from '../types';

export class ContextHandoff {
  private static readonly MAX_RECENT_TURNS = 1;
  private static readonly MAX_SUMMARY_LENGTH = 500;

  create(
    messages: Message[],
    codeBlocks: CodeBlock[],
    activeFiles: string[],
    keyDecisions: string[]
  ): ContextHandoffType {
    const recentTurns = messages.slice(-ContextHandoff.MAX_RECENT_TURNS * 2);
    const summary = this.generateSummary(messages);

    return {
      summary: summary.slice(0, ContextHandoff.MAX_SUMMARY_LENGTH),
      recentTurns,
      activeFiles,
      keyDecisions,
      codeSnippets: codeBlocks.slice(-5) // Keep last 5 code blocks
    };
  }

  private generateSummary(messages: Message[]): string {
    const topics = new Set<string>();
    for (const msg of messages) {
      const words = msg.content.split(' ').slice(0, 10);
      words.forEach(w => topics.add(w.toLowerCase()));
    }

    return `Conversation about: ${[...topics].slice(0, 20).join(', ')}`;
  }
}
