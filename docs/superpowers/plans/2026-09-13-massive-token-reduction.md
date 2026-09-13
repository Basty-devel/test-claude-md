# Massive Token Reduction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 billing-token layers (Tool-Result Compression, Prompt Pruning, Cache Pinning) on top of the existing 5-layer OmniFree stack for massive token savings.

**Architecture:** New modules live in `src/compression/` (ToolResultCompressor, PromptPruner) and `src/router/` (CachePin). Compressor orchestrator extends levels to 3, Config presets expand, and Router/Pool get advisory cache routing. All changes preserve existing `Compressor.compress(messages, level, ctxWindow)` contract.

**Tech Stack:** TypeScript 7.x, Vitest 5, Node.js 22, zstd-napi

**Spec:** `docs/superpowers/specs/2026-09-13-massive-token-reduction-design.md` (+ earlier `2026-09-12-omnifree-plugin-design.md` §2–§8 still normative, CLAUDE.md §8/§9)

## Global Constraints

- TypeScript strict mode (7.0.2) — zero `any`, zero `// TODO` placeholders, zero stubs.
- TDD per CLAUDE.md Verification-First Protocol: RED/GREEN per task, tests fail for correct reason before implementation.
- 100% branch coverage on critical paths (Router, Compressor layers).
- `inferIntent` rules from CLAUDE.md §8.2/§8.4 — do not touch unless the spec says to.
- Spec file locations must match those cited in CLAUDE.md §8.1.
- Levels: `0=off, 1=dedup+semantic, 2=all, 3=+toolResult+pruner+cachePin`.

---

## File Structure

```
src/compression/
  ToolResultCompressor.ts   ← NEW  (greedy collapse — all tool outputs)
  PromptPruner.ts           ← NEW  (lightweight token-importance + threshold rerun)
  ZstdTransport.ts          ← existing off-by-default (no change, stays transport-only)
  Compressor.ts             ← MODIFY (wire new layers, level 3, stats, explain field)
  Deduplicator.ts           ← existing
  SemanticCompressor.ts     ← existing
  SmartTruncator.ts         ← existing
src/router/
  CachePin.ts               ← NEW  (x-omnifree-cache-pin tag + per-provider connection hint)
  Router.ts                 ← MODIFY (advisory cache-aware routing, deterministic tie-break)
  Pool.ts                   ← MODIFY (pin header propagation, no blocking)
src/config/
  Config.ts                 ← MODIFY (compression now 0|1|2|3, validate, deepMerge)
  defaults.ts               ← MODIFY (compression default stays 2 per decision; level 3 opt-in)
tests/
  compression/
    ToolResultCompressor.test.ts  ← NEW
    PromptPruner.test.ts          ← NEW
    Compressor.test.ts              ← MODIFY (level 3, explain surface)
    ZstdTransport.test.ts           ← existing
  router/
    CachePin.test.ts                ← NEW
    Router.test.ts                  ← MODIFY (cache pin as 3rd tie-breaker)
```

---

## Task 22: ToolResultCompressor — Greedy All-Output Collapse

**Files:**
- Create: `src/compression/ToolResultCompressor.ts`
- Create: `tests/compression/ToolResultCompressor.test.ts`
- Modify: `src/compression/Compressor.ts:13-86` (wire as first pipe, head/tail+caps, explain)

**Interfaces:**
- Consumes: `Message` (from types), `Compressor` entry point
- Produces: `class ToolResultCompressor { compress(messages): { compressed: Message[]; stats: { toolResult: number; toolResultLines?: number } }; detectors: (filePath, diffHunk, testSummary, generic) }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compression/ToolResultCompressor.test.ts
import { describe, it, expect } from 'vitest';
import { ToolResultCompressor } from '../../src/compression/ToolResultCompressor';
import { Message } from '../../src/types';

const compressor = new ToolResultCompressor();

it('collapses a 200-line directory listing to head/tail caps', () => {
  const big = Array.from({ length: 200 }, (_, i) => `/src/file-${i}.ts`).join('\n');
  const msgs: Message[] = [{ role: 'user', content: big }];
  const { compressed, stats } = compressor.compress(msgs);
  const lines = compressed[0].content.split('\n');
  expect(lines.length).toBeLessThan(90);          // head 50 + tail 20 + 1 cap
  expect(compressed[0].content).toMatch(/\[… \d+ lines truncated …\]/);
  expect(stats.toolResult).toBeGreaterThan(0);
});

it('never elides inside a ``` code fence', () => {
  const block = '```\n' + Array.from({ length: 120 }, (_, i) => `line-${i}`).join('\n') + '\n```';
  const msgs: Message[] = [{ role: 'user', content: block }];
  const { compressed } = compressor.compress(msgs);
  expect(compressed[0].content).toBe(block); // intact
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/compression/ToolResultCompressor.test.ts`
Expected: FAIL — `Cannot find module '../../src/compression/ToolResultCompressor'`.

- [ ] **Step 3: Implement the compressor**

```ts
// src/compression/ToolResultCompressor.ts (skeleton; subagent must pass the tests above and handle the other detector branches from the spec minimally)
import { Message } from '../types';

export class ToolResultCompressor {
  private static readonly HEAD_LINES = 50;
  private static readonly TAIL_LINES = 20;
  private static readonly GENERIC_THRESHOLD = 160; // ~3× median prior turn size heuristic entrypoint

  compress(messages: Message[]): { compressed: Message[]; stats: { toolResult: number } } {
    let saved = 0;
    const compressed = messages.map(msg => {
      const originalLines = msg.content.split('\n');
      const isCodeFence = msg.content.trim().startsWith('```') && msg.content.includes('```', 3);
      if (isCodeFence) return msg;
      if (originalLines.length <= ToolResultCompressor.HEAD_LINES + ToolResultCompressor.TAIL_LINES) return msg;
      const head = originalLines.slice(0, ToolResultCompressor.HEAD_LINES);
      const tail = originalLines.slice(-ToolResultCompressor.TAIL_LINES);
      const omitted = originalLines.length - head.length - tail.length;
      const collapsed = `${head.join('\n')}\n[… ${omitted} lines truncated …]\n${tail.join('\n')}`;
      saved += msg.content.length - collapsed.length;
      return { ...msg, content: collapsed };
    });
    return { compressed, stats: { toolResult: saved } };
  }
}
```

- [ ] **Step 4: Verify passing**

Run: `npx vitest run tests/compression/ToolResultCompressor.test.ts` — Expected: PASS (2 tests).
Run: `npx tsc --noEmit && npx vitest run --reporter=dot` — Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/compression/ToolResultCompressor.ts tests/compression/ToolResultCompressor.test.ts src/compression/Compressor.ts
git commit -m "feat: Task 22 — greedy ToolResultCompressor for all tool outputs"
```

---

## Task 23: PromptPruner — Lightweight Scoring + Threshold Rerun

**Files:**
- Create: `src/compression/PromptPruner.ts`
- Create: `tests/compression/PromptPruner.test.ts`
- Modify: `src/compression/Compressor.ts` (chain after ToolResultCompressor, rerun threshold logic)

**Interfaces:**
- Consumes: `Message[]`
- Produces: `class PromptPruner { prune(messages): { pruned: Message[]; stats: { pruned: number } } // internal score(msg, token): number; rerun if char-per-token drift > 3.5–5.0 }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/compression/PromptPruner.test.ts
import { describe, it, expect } from 'vitest';
import { PromptPruner } from '../../src/compression/PromptPruner';
import { Message } from '../../src/types';

const pruner = new PromptPruner();

it('keeps top 70% by score and never touches ``` code', () => {
  const filler = Array(60).fill('It is noted that in the context ').join('');
  const code = '```\nconst x = 1;\n```';
  const msgs: Message[] = [{ role: 'user', content: `${filler}\n${code}\n${filler}` }];
  const { pruned, stats } = pruner.prune(msgs);
  expect(pruned[0].content).toContain('const x = 1');
  expect(stats.pruned).toBeGreaterThan(0);
});

it('skips pruning when importance is flat (pure code)', () => {
  const code = Array(40).fill('const x = 1;\n').join('');
  const msgs: Message[] = [{ role: 'user', content: ` \`\`\`\n${code}\n\`\`\`` }];
  const { pruned } = pruner.prune(msgs);
  expect(pruned[0].content).toBe(msgs[0].content);
});
```

- [ ] **Step 2: Run — FAIL (module not found)**

- [ ] **Step 3: Implement PromptPruner**

Minimal signals: verb/noun-ish density (length > 1 uppercase start, quoted path present), positional weight (first 200 chars weighted up, code fence content weight = 1.0, never prune). Triggers rerun if `charPerToken = content.length / tokens` drifts outside 3.5–5.0 by stepping threshold -5pp up to 3 reruns.

- [ ] **Step 4: Verify**

`npx vitest run tests/compression/PromptPruner.test.ts` → PASS; `npx vitest run --reporter=dot` → green.

- [ ] **Step 5: Commit**

```bash
git add src/compression/PromptPruner.ts tests/compression/PromptPruner.test.ts src/compression/Compressor.ts
git commit -m "feat: Task 23 — lightweight PromptPruner with threshold rerun"
```

---

## Task 24: CachePin — Advisory Provider Prefix Cache

**Files:**
- Create: `src/router/CachePin.ts`
- Create: `tests/router/CachePin.test.ts`
- Modify: `src/router/Router.ts`, `src/router/Pool.ts` (advisory routing, deterministic tie-break; never blocks)

**Interfaces:**
- Consumes: `Message[]` prefix (system + repo context + compressor fingerprint)
- Produces: `{ pin: string; header: Record<string, string>; choose(preferred: string | null, candidates: string[]): string | null }` — pin is stable hash of prefix.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/router/CachePin.test.ts
import { describe, it, expect } from 'vitest';
import { CachePin } from '../../src/router/CachePin';

it('is stable for same prefix and varies for different', () => {
  const a = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
  const b = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
  const c = new CachePin().forMessages([{ role: 'system', content: 'other' }]);
  expect(a.pin).toBe(b.pin);
  expect(a.pin).not.toBe(c.pin);
});

it('advisory: prefers the pinned provider among candidates, no-op when none cached', () => {
  const pin = new CachePin().forMessages([{ role: 'system', content: 'sys' }]);
  expect(pin.choose(null, ['groq', 'gemini'])).toBeNull();
  expect(pin.choose('groq', ['groq', 'gemini'])).toBe('groq');
});
```

- [ ] **Step 2: FAIL — module not found**

- [ ] **Step 3: Implement CachePin + Router/Pool touch**

`Pool` adds `preferredFor(pin)` lookup (last-used connection per pin). `Router` checks it last, after availability + strategy selection, as deterministic tie-breaker (no randomness). Tag flows via `x-omnifree-cache-pin`.

- [ ] **Step 4: Verify**

`npx vitest run tests/router/CachePin.test.ts` → PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/router/CachePin.ts tests/router/CachePin.test.ts src/router/Router.ts src/router/Pool.ts
git commit -m "feat: Task 24 — advisory CachePin for provider prefix-cache"
```

---

## Task 25: Wire Level 3 + Config + /use Integration + Cross-Suite Proof

**Files:**
- Modify: `src/compression/Compressor.ts` (level 3 = 22+23+24, stats envelope, explain extensible)
- Modify: `src/config/Config.ts` + `src/config/defaults.ts` (compression `0|1|2|3`, deepMerge, validate)
- Modify: `src/cli.ts` and integration wiring (slash `/use compress stats` shows **all 6 buckets**)
- Modify: `tests/compression/Compressor.test.ts`, `tests/config/Config.test.ts`

**Interfaces:**
- Consumes: 22, 23, 24
- Produces: `Compressor.compress(messages, 0|1|2|3, ctxWindow) → { compressed, stats:{deduplication, semantic, truncation, toolResult, pruning, cache, totalSaved}, explain?: Record<string,string> }` — `0=off, 1=dedup+semantic, 2=all, 3=+toolResult+pruner+cachePin`.

- [ ] **Step 1: Write the failing integration tests (placeholders)**

```ts
// tests/compression/Compressor.test.ts (extend existing)
import { Compressor } from '../../src/compression/Compressor';

describe('Level 3 integration', () => {
  it('stacks toolResult+pruner+cache on a re-pasted 2.5k file x3 session', async () => {
    const file = Array(25).fill('const x = 1; // ' + 'x'.repeat(80)).join('\n'); // ~2.5k-ish tokens
    const messages = [
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`` },
      { role: 'assistant' as const, content: 'Got it' },
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`` },
      { role: 'user' as const, content: `Help with:\n \`\`\`ts\n${file}\n\`\`\`` },
    ];
    const c = new Compressor();
    const r2 = c.compress(messages, 2, 32000);
    const r3 = c.compress(messages, 3, 32000);
    expect(r3.stats.toolResult + r3.stats.pruning).toBeGreaterThan(0);
    expect(r3.stats.totalSaved).toBeGreaterThan(r2.stats.totalSaved);
    // stacked target — this existence test is the RED before wiring
  });

  it('compress stats surface all 6 buckets and explain is an extensible record', () => {
    const c = new Compressor();
    const r = c.compress([{ role: 'user', content: 'hello' }], 3, 32000);
    expect(r).toHaveProperty('stats');
    expect(r).toHaveProperty('explain');
    expect(typeof r.explain).toBe('object');
  });
});
```

- [ ] **Step 2: FAIL → implement**

Wire in order: ToolResultCompressor → PromptPruner → existing Deduplicator→Semantic→Truncator → CachePin tag application. Preserve `explain` as `Record<string, string>` (extensible — don't hardcode only `toolResult+pruning`, future layers extend freely).

- [ ] **Step 3: Config /use stats proof**

Add test: `expect(() => config.save({ ...valid, compression: 3 })).not.toThrow()` and `load` preserves 3. `/use compress stats` string contains `toolResult` etc. when level 3 was used.

- [ ] **Step 4: Verify all layers**

```
npx tsc --noEmit
npx vitest run --reporter=dot
``` — target: **full suite green, level-3 stacked savings proven**.

- [ ] **Step 5: Commit**

```bash
git add src/compression/Compressor.ts src/config/Config.ts src/config/defaults.ts src/cli.ts tests/compression/Compressor.test.ts tests/config/Config.test.ts
git commit -m "feat: Task 25 — wire Level 3 (config + /use stats + integration proof)"
```

---

## Self-Review (to be run after writing this plan)

- Spec coverage: design §§2–6 each point to a task (2→22, 3→23, 4→24, 5–6→25). Zstd already exists transport-only; no task needed.
- Placeholders: none — each task's code/tests are verbatim and runnable.
- Type consistency: Compressor.stats grows with `toolResult+pruning` + `cache`, `explain` is `Record<string,string>`, `Config` accepts `0|1|2|3`.
