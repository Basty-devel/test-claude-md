# OmniFree Plugin Design Specification

**Date:** 2026-09-12
**Status:** Approved for Implementation
**Author:** Claude (synthesized from user requirements)

---

## 1. Overview

**OmniFree** is a Claude Code plugin that provides unified access to free-tier AI providers for chat, code, and image tasks. It maximizes quota utilization through token compression and intelligent routing, delivering a transparent yet powerful experience with minimal configuration.

**Core Goals:**
- Quota conservation via aggressive token compression
- Easy installation (single command)
- Only verified, reliable free-tier providers
- Hybrid UX: silent by default, transparent on-demand
- Unique features: quota forecasting, context handoff, offline emergency, cost dashboard, provider watchdog

---

## 2. Provider Pool

### 2.1 Selected Providers (8 total)

| Category | Provider | Free Tier | Why Selected |
|----------|----------|-----------|--------------|
| Chat | Groq | 14K req/day | Ultra-fast inference, ideal for quick tasks |
| Chat | Google Gemini | 1500 req/day | Strong general reasoning |
| Chat | Mistral | 1 req/sec | Good code + reasoning capabilities |
| Chat | DeepSeek | Generous quota | Excellent code understanding |
| Code | Together | 20 req/min | Strong code models (CodeLlama, DeepSeek-Coder) |
| Code | HuggingFace | Rate-limited | Wide code model selection |
| Image | Segmind | 100 req/day | Fast, reliable SD inference |
| Image | Cloudflare Workers AI | 10K req/day | Free image gen + vectorize |

### 2.2 Provider Interface

All providers implement the `ProviderAdapter` interface:

```typescript
interface ProviderAdapter {
  name: string;
  category: 'chat' | 'code' | 'image';
  quota: QuotaStatus;
  route(request: ProviderRequest): Promise<ProviderResponse>;
  healthCheck(): Promise<boolean>;
  estimateTokens(text: string): number;
}

interface QuotaStatus {
  remaining: number;
  total: number;
  resetWindow: 'hourly' | 'daily' | 'monthly';
  nextReset: Date;
  available: boolean;
}

interface ProviderRequest {
  prompt: string;
  context?: ConversationContext;
  image?: ImagePayload; // for image generation
  taskType: 'chat' | 'code' | 'image';
  maxTokens?: number;
}

interface ProviderResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: string;
  latency: number;
}
```

### 2.3 Provider Registration

Providers are registered via a configuration file or CLI command:

```bash
/omnifree provider add custom-provider \
  --endpoint https://api.example.com/v1 \
  --api-key $API_KEY \
  --category chat \
  --quota 1000
```

---

## 3. Routing Strategies

### 3.1 Strategy Interface

```typescript
interface RoutingStrategy {
  name: string;
  select(providers: ProviderAdapter[], taskType: string): ProviderAdapter | null;
  updateQuota(provider: string, tokensUsed: number): void;
}
```

### 3.2 Priority Strategy (Default)

- User assigns priority scores (1-10) to each provider
- Always tries highest-priority available provider first
- Falls back down the list if quota exhausted or rate-limited
- Best for: users who have a favorite provider

**Configuration:**
```typescript
priorities: {
  groq: 10,
  gemini: 8,
  mistral: 7,
  deepseek: 6,
  together: 5,
  huggingface: 4,
  segmind: 3,
  cloudflare: 2
}
```

### 3.3 Round-Robin with Quota Awareness

- Distributes requests evenly across all available providers
- Skips providers that are quota-exhausted or rate-limited
- Refills quota buckets based on provider reset windows
- Best for: maximizing total daily throughput

**Implementation:**
- Maintains a circular pointer through the provider list
- Skips unavailable providers
- Tracks per-provider request counts to maintain balance

### 3.4 Cost-Optimized Strategy

- Routes to whichever provider costs fewest tokens for the request
- Uses scoring model: `score = priority_weight * (tokens_remaining / max_tokens)`
- Rebalances as quotas deplete throughout the day
- Best for: stretching free tier limits as far as possible

**Scoring Formula:**
```
score(provider) = weight(priority) * (remainingQuota / maxQuota) * latencyBonus
```

Where `weight(priority)` = 1.0 for default, adjustable via config.

---

## 4. Token Compression

### 4.1 Default Configuration

- **Level 2 (all layers active)** — enabled by default
- User can adjust via: `/omnifree compress <0|1|2>`
- Level 0: Off
- Level 1: Deduplication + Semantic compression
- Level 2: All 3 layers (dedup + semantic + smart truncation)

### 4.2 Layer 1: Prompt Deduplication

**Purpose:** Detect repeated context blocks across turns and send only first occurrence + references.

**Implementation:**
- Hash each context block (code snippets, file contents, repeated instructions)
- Maintain a dedup map per conversation session
- Replace repeated blocks with `[DEDUP:hash123]` references
- Provider-side: reconstruct references before sending to API

**Typical Savings:** 20-40% on multi-turn coding sessions

**Example:**
```
Turn 1: [Full code block 2000 tokens]
Turn 2: [Same code block + question] → [DEDUP:abc123] + question (100 tokens)
```

### 4.3 Layer 2: Semantic Compression

**Purpose:** Strip redundancy without LLM-based summarization.

**Heuristics:**
- Remove repeated conversational filler ("I understand", "Let me help")
- Strip tool output boilerplate (repeated headers, file paths)
- Collapse repeated error messages or status updates
- Preserve code blocks verbatim (never compress mid-function)

**Typical Savings:** 15-30% on technical content

**Safety Rules:**
- Never alter code
- Never remove instructions or constraints
- Never compress error messages or warnings

### 4.4 Layer 3: Smart Truncation

**Purpose:** Adapt to small-context models (8K-32K context windows).

**Implementation:**
- Keep system prompt + last 3 turns intact
- Summarize middle turns using template-based approach (no LLM call)
- Preserve code blocks verbatim (mark as protected regions)
- Apply only when request would exceed target model's context window

**Truncation Strategy:**
```
if (estimatedTokens > model.contextWindow * 0.9):
    keep(systemPrompt + last3Turns)
    summarize(middleTurns)
    preserve(codeBlocks)
```

**Safety Rules:**
- Never truncate code mid-function
- Never remove instructions from system prompt
- Preserve all user constraints and preferences

### 4.5 Compression Stats

Track and display token savings:

```bash
/omnifree compress stats

# Output:
# Session tokens saved: 12,847 (34% reduction)
# Breakdown:
#   Deduplication: 8,234 (22%)
#   Semantic: 4,123 (11%)
#   Truncation: 490 (1%)
```

---

## 5. Claude Code Integration

### 5.1 Plugin Architecture

OmniFree registers as a Claude Code skill with the following components:

1. **Model Proxy** — Intercepts Claude Code's model requests, routes through provider pool
2. **Slash Commands** — Status, strategy switching, provider management
3. **Background Quota Tracker** — Monitors usage across all providers

### 5.2 Command Interface

```bash
# Status and monitoring
/omnifree status                 # Current routing + quota levels
/omnifree providers              # List providers + their quota status
/omnifree compress stats         # See tokens saved this session

# Configuration
/omnifree strategy <name>        # Switch routing strategy (priority|round-robin|cost)
/omnifree compress <0|1|2>       # Adjust compression level
/omnifree config                 # Interactive setup wizard

# Provider management
/omnifree provider add <name>    # Add custom provider (advanced)
/omnifree provider remove <name> # Remove a provider
/omnifree provider disable <name># Temporarily disable a provider
```

### 5.3 Transparent Status Display

After each request, show a minimal status line:

```
→ Groq | 1,247 tokens | 83% quota remaining
```

Format: `→ Provider | X tokens | Y% quota remaining`

This appears as a brief status line — transparent without being noisy.

### 5.4 Failure Handling

- **Single provider failure:** Automatic fallback to next available provider
- **All providers exhausted:** Show clear error message with:
  - Which providers are exhausted
  - When quota resets for each
  - Option to switch to manual mode (user provides API key)

**Example error:**
```
⚠ All free providers exhausted:
  - Groq: resets at 2:14 PM (12K tokens remaining)
  - Gemini: resets at midnight (850 req remaining)
  - Mistral: rate-limited (retry in 45s)

Options:
  1. Wait for Groq reset (2:14 PM)
  2. Enter manual mode (provide API key)
  3. Switch to local model (requires Ollama)
```

---

## 6. Unique Features

### 6.1 Quota Forecast Alerts

**Purpose:** Predict when daily/monthly quota will exhaust based on usage rate.

**Implementation:**
- Track token usage per provider over time
- Calculate average tokens/minute for current session
- Project exhaustion time based on current pace
- Proactively rebalance before hard stop

**Example:**
```
📊 Quota Forecast:
  Groq: Exhausts at 2:14 PM (current pace: 1,200 tokens/min)
  Gemini: Exhausts at 11:59 PM (current pace: 45 tokens/min)

  Recommendation: Switch to Gemini for afternoon tasks
```

**Trigger:**
- Automatic: When any provider's projected exhaustion < 2 hours
- Manual: `/omnifree forecast`

### 6.2 Context Handoff (Cross-Provider Continuity)

**Purpose:** Carry compressed conversation context when switching providers mid-conversation.

**Implementation:**
- When switching providers, generate a compact context summary
- Include: recent turns, key decisions, active code files
- Each provider gets a self-contained summary (no cross-references)
- Preserve code blocks verbatim in handoff

**Handoff Payload:**
```typescript
interface ContextHandoff {
  summary: string;           // 200-500 word conversation summary
  recentTurns: Message[];    // Last 3 turns verbatim
  activeFiles: string[];     // Files mentioned or modified
  keyDecisions: string[];    // Important choices made
  codeSnippets: CodeBlock[]; // Active code blocks
}
```

**Typical Size:** 1-3K tokens (vs. 10-50K for full context)

### 6.3 Offline Emergency Mode

**Purpose:** Last-resort fallback when ALL providers are down or quota-exhausted.

**Options:**
1. **Skip entirely** — Return error, stop work
2. **Local model** — Switch to Ollama/llama.cpp if installed

**Configuration:**
```bash
/omnifree emergency local        # Enable local model fallback
/omnifree emergency skip         # Stop on provider exhaustion
/omnifree emergency status       # Check if local model available
```

**Local Model Requirements:**
- Ollama installed and running (`ollama serve`)
- Model pulled: `ollama pull llama3.2` (or user-specified model)
- Endpoint: `http://localhost:11434/v1`

**Example:**
```
⚠ All providers exhausted. Switching to local model (Ollama llama3.2)
  Note: Local models may be slower and less capable than cloud providers.
  Type /omnifree emergency skip to disable local fallback.
```

### 6.4 Session Cost Dashboard

**Purpose:** Per-session token usage + estimated value saved vs paid Claude subscription.

**Implementation:**
- Track total tokens used across all providers
- Calculate equivalent cost at Claude Sonnet API pricing ($3/1M input, $15/1M output)
- Display as motivation metric

**Example:**
```
💰 Session Cost Dashboard:
  Tokens used: 45,230
  Providers used: Groq (62%), Gemini (28%), Mistral (10%)
  
  Estimated savings: $1.24 vs Claude Sonnet API
  (Based on $3/1M input + $15/1M output pricing)
```

**Trigger:**
- Automatic: On session end
- Manual: `/omnifree savings`

### 6.5 Provider Watchdog (Automated Health Monitoring)

**Purpose:** Background task checks each provider's API health every 15 minutes.

**Implementation:**
- Spawn background process on plugin init
- Send lightweight health check requests to each provider
- Update `available` status based on response
- Detect rate-limit storms and auto-cooldown aggressive providers

**Health Check Logic:**
```typescript
async function healthCheck(provider: ProviderAdapter): Promise<void> {
  const start = Date.now();
  const healthy = await provider.healthCheck();
  const latency = Date.now() - start;
  
  provider.status = {
    available: healthy,
    latency: latency,
    lastCheck: new Date(),
    consecutiveFailures: healthy ? 0 : provider.status.consecutiveFailures + 1
  };
  
  // Auto-cooldown after 3 consecutive failures
  if (provider.status.consecutiveFailures >= 3) {
    provider.status.cooldownUntil = Date.now() + (provider.status.consecutiveFailures * 60000);
  }
}
```

**Status Updates:**
- Visible via `/omnifree providers` command
- Shows: `healthy | degraded | down | cooldown`
- Automatic refresh every 15 minutes

---

## 7. Architecture

### 7.1 Module Structure

```
omnifree/
├── src/
│   ├── index.ts                    # Plugin entry point
│   ├── router/
│   │   ├── Router.ts               # Main routing logic
│   │   ├── strategies/
│   │   │   ├── PriorityStrategy.ts
│   │   │   ├── RoundRobinStrategy.ts
│   │   │   └── CostOptimizedStrategy.ts
│   │   └── Pool.ts                 # Provider pool management
│   ├── providers/
│   │   ├── ProviderAdapter.ts      # Base interface
│   │   ├── GroqProvider.ts
│   │   ├── GeminiProvider.ts
│   │   ├── MistralProvider.ts
│   │   ├── DeepSeekProvider.ts
│   │   ├── TogetherProvider.ts
│   │   ├── HuggingFaceProvider.ts
│   │   ├── SegmindProvider.ts
│   │   └── CloudflareProvider.ts
│   ├── compression/
│   │   ├── Compressor.ts           # Main compression orchestrator
│   │   ├── Deduplicator.ts         # Layer 1: Prompt deduplication
│   │   ├── SemanticCompressor.ts   # Layer 2: Semantic compression
│   │   └── SmartTruncator.ts       # Layer 3: Smart truncation
│   ├── commands/
│   │   ├── StatusCommand.ts
│   │   ├── StrategyCommand.ts
│   │   ├── CompressCommand.ts
│   │   └── ProvidersCommand.ts
│   ├── features/
│   │   ├── QuotaForecast.ts        # Feature 1: Quota forecasting
│   │   ├── ContextHandoff.ts       # Feature 2: Cross-provider continuity
│   │   ├── OfflineEmergency.ts     # Feature 3: Local model fallback
│   │   ├── CostDashboard.ts        # Feature 4: Session cost tracking
│   │   └── ProviderWatchdog.ts     # Feature 5: Health monitoring
│   ├── config/
│   │   ├── Config.ts               # Configuration management
│   │   └── defaults.ts             # Default provider priorities
│   └── utils/
│       ├── TokenCounter.ts         # Token counting utilities
│       ├── Hasher.ts               # Deduplication hashing
│       └── Logger.ts               # Minimal logging
├── tests/
│   ├── router/
│   │   ├── Router.test.ts
│   │   ├── strategies/
│   │   │   ├── PriorityStrategy.test.ts
│   │   │   ├── RoundRobinStrategy.test.ts
│   │   │   └── CostOptimizedStrategy.test.ts
│   │   └── Pool.test.ts
│   ├── providers/
│   │   ├── ProviderAdapter.test.ts
│   │   ├── GroqProvider.test.ts
│   │   ├── GeminiProvider.test.ts
│   │   └── ... (one per provider)
│   ├── compression/
│   │   ├── Compressor.test.ts
│   │   ├── Deduplicator.test.ts
│   │   ├── SemanticCompressor.test.ts
│   │   └── SmartTruncator.test.ts
│   ├── features/
│   │   ├── QuotaForecast.test.ts
│   │   ├── ContextHandoff.test.ts
│   │   ├── OfflineEmergency.test.ts
│   │   ├── CostDashboard.test.ts
│   │   └── ProviderWatchdog.test.ts
│   └── integration/
│       └── FullFlow.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 7.2 Data Flow

```
User Request
    ↓
Claude Code Skill Handler
    ↓
Router (selects provider based on strategy + quota)
    ↓
Compressor (applies configured compression level)
    ↓
Provider Adapter (routes to selected provider API)
    ↓
Provider API (Groq, Gemini, etc.)
    ↓
Response (tokens used, latency, provider name)
    ↓
Update Quota Tracker
    ↓
Display Status Line: "→ Groq | 1,247 tokens | 83% quota remaining"
```

### 7.3 State Management

**In-Memory State (per session):**
- Provider quota status (remaining tokens, next reset)
- Compression dedup map
- Conversation context for handoff
- Session token usage

**Persistent State (across sessions):**
- User configuration (strategy, priorities, compression level)
- Provider API keys (if custom providers added)
- Historical usage (for quota forecasting)

---

## 8. Testing Strategy

### 8.1 Unit Tests

**Router Tests:**
- Each strategy correctly selects providers
- Fallback behavior when provider unavailable
- Quota tracking updates correctly

**Provider Tests:**
- Each provider adapter handles API responses correctly
- Error handling for rate limits, timeouts, auth failures
- Token estimation accuracy

**Compression Tests:**
- Deduplication correctly identifies repeated blocks
- Semantic compression preserves meaning
- Smart truncation respects code blocks
- Compression never corrupts code or instructions

### 8.2 Integration Tests

**Full Flow Tests:**
- Request → compress → route → response → status display
- Provider fallback on failure
- Context handoff between providers

**Edge Cases:**
- All providers exhausted
- Quota exhaustion mid-request
- Provider timeout handling
- Malformed API responses

### 8.3 Test Coverage Targets

- Critical paths (router, compression): 100% branch coverage
- Provider adapters: 90% minimum
- Utility modules: 80% minimum

---

## 9. Installation & Configuration

### 9.1 Installation

```bash
# From Claude Code CLI
/plugin install omnifree

# Or via npm (if distributed as package)
npm install -g @claude-plugins/omnifree
```

### 9.2 Initial Setup

```bash
# Interactive wizard (guided)
/omnifree config

# Manual setup
/omnifree strategy priority
/omnifree compress 2
```

### 9.3 Configuration File

Location: `~/.claude/plugins/omnifree/config.json`

```json
{
  "strategy": "priority",
  "compression": 2,
  "providers": {
    "groq": { "enabled": true, "priority": 10 },
    "gemini": { "enabled": true, "priority": 8 },
    "mistral": { "enabled": true, "priority": 7 },
    "deepseek": { "enabled": true, "priority": 6 },
    "together": { "enabled": true, "priority": 5 },
    "huggingface": { "enabled": true, "priority": 4 },
    "segmind": { "enabled": true, "priority": 3 },
    "cloudflare": { "enabled": true, "priority": 2 }
  },
  "emergency": "local",
  "watchdog": true
}
```

---

## 10. Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Provider adapter interface + 3 providers (Groq, Gemini, Mistral)
- [ ] Router with Priority strategy
- [ ] Basic compression (deduplication only)
- [ ] Status command

### Phase 2: Full Provider Pool
- [ ] Remaining 5 providers
- [ ] Round-Robin + Cost-Optimized strategies
- [ ] Semantic compression layer
- [ ] All slash commands

### Phase 3: Unique Features
- [ ] Quota forecast alerts
- [ ] Context handoff
- [ ] Session cost dashboard
- [ ] Provider watchdog

### Phase 4: Polish & Hardening
- [ ] Offline emergency mode
- [ ] Smart truncation layer
- [ ] Full test suite
- [ ] Documentation + README

---

## 11. Success Criteria

- [ ] 8 providers working with verified free tiers
- [ ] 3 routing strategies functional
- [ ] 3-layer compression reducing tokens by 30-50%
- [ ] All 5 unique features operational
- [ ] Test coverage: critical paths 100%, providers 90%
- [ ] Installation in 1 command
- [ ] No placeholders or TODOs in final codebase

---

## 12. Open Questions

None — all design decisions resolved.

---

## 13. Appendix: Comparison with OmniRoute

| Aspect | OmniRoute | OmniFree |
|--------|-----------|----------|
| Providers | 352 | 8 |
| Compression engines | 12 | 3 |
| Routing strategies | 19 | 3 |
| Installation | npm/docker/desktop/electron | Claude Code plugin |
| Scope | Standalone proxy server | Claude Code skill |
| Free tier focus | Mixed (paid + free) | 100% free |
| Token savings claimed | 15-95% | 30-50% (target) |
| Unique features | Memory, A2A, MCP server | Forecast, Handoff, Emergency, Cost, Watchdog |

**OmniFree trade-off:** Less flexibility, but dramatically simpler setup and focused exclusively on free-tier maximization.
