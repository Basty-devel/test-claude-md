export class TokenCounter {
  private static readonly CHARS_PER_TOKEN = 4;

  static estimate(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  static fromUsage(usage: { prompt_tokens: number; completion_tokens: number }): number {
    return usage.prompt_tokens + usage.completion_tokens;
  }

  static countMessages(messages: { content: string }[]): number {
    return messages.reduce((sum, msg) => sum + this.estimate(msg.content), 0);
  }
}
