# OmniFree — the free AI router for Claude Code

> **One slash, zero setup — `/use`**

OmniFree is a **Claude Code plugin** that routes every request through **8 verified free-tier providers** (chat, code, image) and reclaims your quota with **level-2-by-default token compression**. One quoted command line decides Bash vs chat; you never split into `omnifree bash …` / `omnifree chat …`. A plugin is installed as `@basty/omnifree`, exposed as the canonical short skill `/use` — `/omnifree` is the documented alias.

> "Write a solidity test" + "run my tests" — same line style, different execution.
>
> ```bash
> /use "write tests for src/router/Pool.ts"
> /use "git log -1 --stat"
> ```

---

## Installation

OmniFree is **not on the official Claude marketplace** (routes through free providers, not Anthropic's paid API). Install manually:

### npm

```bash
npm install -g @basty/omnifree@latest   
/omnifree        # alias; canonical is /use
```

### From source

```bash
git clone https://github.com/Basty-devel/test-claude-md.git
cd test-claude-md
npm install && npm run dev
```

### Register with Claude Code

After npm install, register the plugin manually:

```bash
# Option A: Add as local marketplace
claude plugin marketplace add github.com/Basty-devel/test-claude-md

# Option B: Copy plugin files
mkdir -p ~/.claude/plugins/@basty/omnifree
cp -r dist/ skills/ .claude-plugin/ ~/.claude/plugins/@basty/omnifree/
```

Restart Claude Code, then test:
```
/use "hello"
```

Config: `~/.claude/plugins/omnifree/config.json` (created on save).

---

## How it works

### Unified `/use` CLI — intent-inferred execution

| Input | What happens | Example |
|-------|--------------|---------|
| Natural language, code questions, prompts, or a `.`/`?` heuristic | Chat → compressed → `Pool`/`Router` → free provider, inline | `/use "summarize this PR"` |
| Pipe/redirection/heredoc (`\|  >  >>  <  <<  &&  \|\|  $(  \``), path-ish `./ ../ /bin/ /usr/`, or `sudo`/`npm`/`npx`/`git`/`docker`/`make`/`pip`/`yarn` lead, or a trailing `!`/`$` sentinel | Bash → local shell (`child_process.exec`) with cwd preserved; stdout/stderr streamed | `/use "ls -la src"` |
| Override | `bash:` / `chat:` prefix forces intent w/out touching the heuristic | `/use "bash: who am i"` · `/use "chat: ls -la"` |

Bare `/use` with no text returns a native Desktop App help card (not a Browser tab) and exits without side effects — per `CLAUDE.md` §8.4 — so every user account can update without breakage.

**Invariants.** The whole command is **one quoted string** (avoids host shell splitting). Chat turns run through the compressor at the configured level. Quota usage is charged to the routed provider; failures fall back per `Pool`/`Router`. All free providers are listed with real free tiers (§3). The only place for the inferred dispatch is `src/cli.ts` (`inferIntent()` + `dispatch()`) + slash wiring in `src/commands/`.

---

## Token compression — massiv

Defaults to **Level 2** (deduplication + semantic + truncation). Opt in to **Level 3** for massive billing-token savings.

| Level | What it does | Knocks off |
|-------|--------------|------------|
| **1 — Deduplicator** | SHA-256 hash for every ≥50-char block (code fences, file dumps). First copy kept, rest → `[DEDUP:hash]` | **20–40%** in multi-turn coding (re-pasting files) |
| **2 — SemanticCompressor** | Regex filler + tool boilerplate (`=====`) — never touches ```` ``` ```` code blocks | **15–30%** on chatty output |
| **2 — SmartTruncator** | Triggers near the window (90%): keep system + last 3 turns, summarize the middle, preserve code blocks | Only when you'd otherwise overflow |
| **3 — ToolResultCompressor** | Head 50 + tail 20 + error preservation for all tool outputs; code-fence intact | Stacks on Level 2 |
| **3 — PromptPruner** | 5-signal scoring (uppercase/quoted/positional/word-diversity/specificity), keep top ~70% | Reruns at −5pp on tokenizer drift |
| **3 — CachePin** | Advisory `x-omnifree-cache-pin` stable hash; Router pins to same provider connection when prefix cache available | ~10–30% when honored |
| **Transport (off by default)** | `ZstdTransport` — native Zstandard wire compression via `zstd-napi` for payloads > 10k tokens (~40k bytes) | Wire throughput; not billed |

All six billing buckets surface in `/use compress stats`; the un-billed transport layer is accounted separately.

```
→ groq | 1,247 tokens (saved 312: dedup 84, semantic 31, truncation 61, toolResult 102, pruning 34)
```

> 📸 **Happens-before:** Every free-pool request + pre-routing chat prompt passes through `src/compression/` **before** provider selection and billing — including when the free pool isn't exhausted. No bypass.

## Benchmarks — billed-token proxy

Real compression runs via [`benchmarks/compression-benchmark.ts`](benchmarks/compression-benchmark.ts) (`npx tsx benchmarks/compression-benchmark.ts` → [`COMPRESSION_BENCHMARK.md`](COMPRESSION_BENCHMARK.md)). **Metric:** `Math.ceil(chars / 4)` billed-token proxy; levels `0=off · 1=dedup+semantic · 2=all · 3=+toolResult+pruner+cachePin`.

| Scenario | L2 | Saved | % | L3 | Saved | % |
|---|---:|---:|---:|---:|---:|---:|
| Simple chat (baseline) | 2 | 0 / 21 | 0% | 3* | 0 / 21 | 0% |
| Repeated file paste (3× ~1k tok) | 2 | 0 / 1,037 | 0% | 3* | 1,242 / 1,037 | 120% |
| Filler text + code fences | 2 | 29 / 132 | 22% | 3* | 91 / 132 | 69% |
| Long conversation (truncation @ 1k window) | 2 | 52 / 1,477 | 4% | 3* | 52 / 1,477 | 4% |
| Chatty tool output | 2 | 0 / 830 | 0% | 3* | 0 / 830 | 0% |
| Mixed code + realistic session | 2 | 7 / 77 | 9% | 3* | 7 / 77 | 9% |
| Re-pasted large file (3× 2.5k) | 2 | 2,857 / 2,030 | 141% | 3* | 4,416 / 2,030 | 218% |
| **Avg (all scenarios)** | **2** | **2,945** | **25%** | **3*** | **5,808** | **60%** |

**Legend:** `L = compression level (3* = opt-in, proof-at-L3 > L2 on re-pasted file 3× session). Cache is advisory and bills 0 in this synthetic run (no stable-prefix cache hit).` Full table: [`COMPRESSION_BENCHMARK.md`](COMPRESSION_BENCHMARK.md).

---

## Providers (8 × verified free tier, no credit card)

| Category | Provider | Free tier | Model |
|----------|----------|-----------|-------|
| chat | **Groq** | 14K req/day | llama-3.3-70b-versatile |
| chat | **Google Gemini** | 1500 req/day | gemini-2.0-flash |
| chat | **Mistral** | rate-limited | mistral-small-latest |
| chat | **DeepSeek** | 5K tokens/day | deepseek-chat |
| code | **Together** | quota-managed | CodeLlama 34B Instruct |
| code | **Hugging Face** | quota-managed | CodeLlama / open code models |
| image | **Segmind** | quota-managed | stable-diffusion-xl-turbo |
| image | **Cloudflare Workers AI** | quota-managed | sd-xl-base-1.0 via REST |

Custom endpoints are allowed (`/use provider add custom …` → stored in `~/.claude/plugins/omnifree/config.json`).

---

## Routing — Pool + Strategy

`src/router/` — `Pool` stores providers by category, `Router.route(...)` selects via injected `RoutingStrategy`.

| Strategy | How it picks | Good for |
|----------|--------------|----------|
| **priority** (default) | Highest configured priority, skip if unavailable or rate-cooled | Stable setups |
| **round-robin** | Round-robin over available providers of the right category | Spread quota |
| **cost** | Highest expected free quota (daily capacity × remaining ratio) first | Max free headroom |

Provider branching is 100% tested for coverage on critical paths.

---

## Commands

```bash
# One line does both jobs — intent inferred; quote the whole command
/use "summarize this PR"                # chat
/use "git log -1 --stat"                # bash
/use "explain src/providers/GroqProvider.ts"   # chat
/use "ls -la src"                       # bash
/use "bash: who am i"                   # forced bash (prefix, no heuristic)
/use "chat: ls -la"                     # forced chat (treated as prompt, no exec)

# Status and monitoring
/use status                 # Current routing + quota levels
/use providers              # List providers + quota status
/use compress stats         # Tokens saved this session (all 6 buckets + explain + transport)
/use providers              # List all providers (aliasable)

# Configuration
/use strategy <name>        # Switch strategy (priority | round-robin | cost)
/use compress <0|1|2|3>     # Level 0=off, 1=dedup+semantic, 2=all, 3=+toolResult+pruner+cachePin (2 default)
/use config                 # Interactive setup wizard

# Provider management
/use provider add <name>    # Add custom provider (advanced)
/use provider remove <name> # Remove a provider
/use provider disable <name># Temporarily disable a provider

# Forecast / emergency / savings (spec §6)
/use forecast               # Quota exhaustion projection
/use emergency local        # Fallback to local model (Ollama / llama.cpp)
/use emergency skip         # Stop on exhaustion
/use savings                # Session cost dashboard

# Help
/use                        # Help card (also available on the Desktop App chat card)
/use --help                 # Slash reference
/use -h                     # Slash reference
```

---


## Architecture at a glance

```
OmniFree — src/
  compression/
    ToolResultCompressor   ← greedy all-output head/tail + error preservation
    PromptPruner           ← 5-signal scorer, top ~70% + threshold rerun
    Compressor             ← levels 0|1|2|3 + flat CompressionStats + explain (Record<string,string>)
    ZstdTransport          ← wire Zstd, off by default, threshold ~10k tokens / ~40k bytes
    Deduplicator, SemanticCompressor, SmartTruncator
  router/
    Pool                   ← providers by name/category, quotas, pin records
    Router                 ← strategy inject + cache-aware tie-break (advisory, deterministic)
    CachePin               ← stable hash → x-omnifree-cache-pin header (advisory, never blocks)
    strategies/            PriorityStrategy, RoundRobinStrategy, CostOptimizedStrategy
  features/                OfflineEmergency, CostDashboard, ProviderWatchdog, QuotaForecast, ContextHandoff
  config/                  Config.load/save + deepMerge + validate (0|1|2|3) + defaults
  commands/                StatusCommand, StrategyCommand
  cli.ts                   inferIntent() + dispatch() + CLI.run() + handleSlashCommand
  types.ts                 shared types (incl. CompressionStats, resource semantics)
  utils/                   Hasher (SHA-256), TokenCounter (chars/4), Logger
```

`CLAUDE.md` §8 is the binding product surface; `docs/superpowers/specs/` carries the full value stacks and API contracts; `.superpowers/sdd/` carries the SDD ledgers.

---

## Verification

```bash
npx tsc --noEmit
npx vitest run               # critical paths: 100% branch coverage required
npx vitest run --reporter=dot
```

Quality gates per `CLAUDE.md`:

- Zero placeholders (`// TODO`, `pass`, `...`, stubs) in any commit state
- Strict typing, typed `dataclasses`/`Zod`/Rust-struct style at module boundaries
- Type annotations mandatory on all public functions/constants
- CLI invariants proven: one quoted string, chat through compressor, quota attributed, Bash never loads credentials

---

## Development notes (CLAUDE.md is law — only a summary here)

- Install **implemented** providers: gym/Gorq/… — only with **real free tiers**; quota routing wired through `TokenCounter`.
- Compression always runs at the **configured level** (2 default) with **evidence before assertions** (`compress stats`).
- Naming: `compressed` | `approved` | `merged`; copy-then-diff for `/use` help-card work (`-h`/`--help`, `npx`) uses `cp -u` (no overwrite, no `rm -rf`) for any pre-existing report/code in `.superpowers/sdd/` between SDD tasks — no destructive `git clean -fdx` in the steady-state flow.
- Work happens only via skills and subagents; shell runs are tracked and artifacted. Parallel cap **4** whenever beneficial (independent files/no shared state) per `CLAUDE.md` §9.

---

## Specs and plans

| Topic | Spec |
|-------|------|
| Unified notion + inferred CLI + compression levels | [`docs/superpowers/specs/2026-09-12-omnifree-plugin-design.md`](docs/superpowers/specs/2026-09-12-omnifree-plugin-design.md) §5.2–§5.4 + §5.2.1 |
| Massive token reduction (Tool-Result + Pruning + CachePin → Level 3) | [`docs/superpowers/specs/2026-09-13-massive-token-reduction-design.md`](docs/superpowers/specs/2026-09-13-massive-token-reduction-design.md) |

Implementation plan: [`docs/superpowers/plans/`](docs/superpowers/plans/).

License: **PolyForm Noncommercial 1.0.0** — see [`LICENSE`](LICENSE) and [`PUBLIC_KEY.asc`](PUBLIC_KEY.asc).

Noncommercial use (personal, research, education, non-commercial org) is free. Commercial use needs a separate licence; contact [sebastian.nestler@tutanota.de](mailto:sebastian.nestler@tutanota.de) (PGP fingerprint `249C79B407B88BD985FBD168F2A2767E68F2D83F`).

Maintainer: **Sebastian Friedrich Nestler** (`sebastian.nestler@tutanota.de`).
