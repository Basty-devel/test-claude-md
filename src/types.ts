export interface QuotaStatus {
  remaining: number;
  total: number;
  resetWindow: 'hourly' | 'daily' | 'monthly';
  nextReset: Date;
  available: boolean;
}

export interface ProviderRequest {
  prompt: string;
  context?: ConversationContext;
  image?: ImagePayload;
  taskType: 'chat' | 'code' | 'image';
  maxTokens?: number;
}

export interface ProviderResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: string;
  latency: number;
}

export interface ConversationContext {
  messages: Message[];
  systemPrompt?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ImagePayload {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

export interface ProviderConfig {
  name: string;
  category: 'chat' | 'code' | 'image';
  priority: number;
  enabled: boolean;
  apiKey?: string;
}

export interface PluginConfig {
  strategy: 'priority' | 'round-robin' | 'cost';
  compression: 0 | 1 | 2 | 3;
  providers: Record<string, ProviderConfig>;
  emergency: 'local' | 'skip';
  watchdog: boolean;
}

export interface ContextHandoff {
  summary: string;
  recentTurns: Message[];
  activeFiles: string[];
  keyDecisions: string[];
  codeSnippets: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

export interface CompressionStats {
  totalSaved: number;
  percentage: number;
  deduplication: number;
  semantic: number;
  truncation: number;
  toolResult: number;
  pruning: number;
  cache: number;
}
