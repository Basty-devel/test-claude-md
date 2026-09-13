# Massive Token Reduction — Design Spec

**Date:** 2026-09-13
**Status:** Approved (continuation — post `/use` unified CLI + Zstd)
**Scope:** 3 new billing-token layers on top of existing 5 (Dedup, Semantic, Truncator, Zstd-transport, Unified CLI)
**Target:** 40–60% billed tokens saved with zero code corruption

---

## 1. Overview

Three features requested as a single architectural unit:

1. **Tool-Result Compression** — collapse verbose outputs greedily before any layer
2. **Prompt Pruning** — score remaining tokens by importance, rerun with adjusted threshold if packing confuses the provider's tokenizer
3. **Cache Pinning** — keep reusable prompt prefixes on the same connection for provider-side cache hits

All live inside `src/compression/` + `src/router/` so existing `Compressor.compress(messages, level, ctxWindow)` contract is preserved (levels grow, no breakage).

---

## 2. Tool-Result Compression (All Outputs)

**Location:** `src/compression/ToolResultCompressor.ts` — first pipe in `Compressor`.

**Input:** raw `Message[]` as produced by Runtime (shell, Read, Grep/Glob, AGENT tool output). **Scope B:** all agent tool outputs, not only failed.

**Detectors + policy (greedy):**

- File paths / directory listings (`/src/...`, `node_modules/...`): keep first 50 visible lines + last 20; collapse middle with `[… N lines truncated …]`.
- Diff hunks (`@@ … @@`): keep changed hunks verbatim, elide context-only hunks beyond a per-file cap.
- Test/lint summaries (`Test Files …`, coverage table): keep headline + first failure, elide repeated pass lines.
- Generic: if a single tool output exceeds 3× the median prior turn size, apply the same head/tail + error-line pass.

**Invariant:** Errors, failing assertions, and code blocks (` ``` ` fences) are never elided mid-line. The policy is deterministic (no LLM call).

---

## 3. Prompt Pruning

**Location:** `src/compression/PromptPruner.ts`.

**Method:** Lightweight token-importance scoring, no LLM:

- Signals: POS-ish verb/noun presence, positional weight (early instructions > mid-chatter), code-block protection, quoted paths.
- Keep top ~70% by score; then **rerun** with threshold stepped down (-5pp) if the provider's tokenizer would be confused by the packing (detected via a quick ratio sanity check: character-per-token drift beyond 3.5–5.0 reasonable band).

**Fallback:** If importance is flat (e.g., pure code), skip pruning (return intact).

---

## 4. Cache Pinning

**Location:** `src/router/CachePin.ts` + small touch in `src/router/Router.ts` / `src/router/Pool.ts`.

**Idea:** Sticky-header `x-omnifree-cache-pin: <hash>` for stable prefix (system prompt + repo context + compressor fingerprint). `Router` prefers the **same** `ProviderAdapter` connection for successive requests sharing the prefix, surfacing provider-side KV-cache hits (Gemini/Claude/Groq where available). Bills less input on repeats; on the repeated-capsule cases, typically 10–30% billed-token equivalent when the provider honors cache.

**Scope:** Only when provider advertises prefix caching; otherwise a no-op tag (never blocks routing).

---

## 5. Wiring

- Levels: `0=off, 1=dedup+semantic, 2=all, 3=+tool-result+pruner+cachePin` (config already Level 2 default; 3 is opt-in until proven stable).
- `/use compress stats` shows **deduplication / semantic / truncation / toolResult / pruning / cache / totalSaved**.
- `Config.load()` preserves `compression` as `0|1|2|3` with deepMerge.
- Zstd (`src/compression/ZstdTransport.ts`) stays **transport-only and off by default** — does not overlap billed layers; it can wrap the final prompt after `Compressor` when above `MIN_TOKENS`.

---

## 6. Success Criterion

- Level 3 (toolResult+pruner+cache) **stacks** on top of today's Level 2 to reach 40–60% billed tokens saved on representative sessions (re-pasted 2.5k file 3× + chatty logs), with zero test regressions.

---

## 7. Self-review

- Placeholders: none — detectors, thresholds, invariants, and levels are explicit above.
- Internal consistency: Compressor contract is extended, not broken; cache pin is advisory, not blocking.
- Scope: single implementation plan (3 modules, tightly integrated).
- Ambiguity: "greedy" and "rerun threshold" are explicitly defined above.

---

*Spec committed per CLAUDE.md §9 (parallel-cap 4). Previous parallel-cap and `/use` wording (§8) preserved.*
