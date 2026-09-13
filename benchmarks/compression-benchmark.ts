#!/usr/bin/env npx tsx
/**
 * Comprehensive Compression Benchmark
 * Tests all compression levels (0, 1, 2, 3) with realistic scenarios
 * Measures actual billed token savings
 */

import { Compressor } from '../src/compression/Compressor';
import { Message } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

const compressor = new Compressor();

interface BenchmarkCase {
  name: string;
  messages: Message[];
  contextWindow: number;
  description: string;
}

interface BenchmarkResult {
  caseName: string;
  description: string;
  level: number;
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  savingsPercent: number;
  breakdown: {
    deduplication: number;
    semantic: number;
    truncation: number;
    toolResult: number;
    pruning: number;
    cache: number;
  };
  explain?: Record<string, string>;
}

// ============================================================
// TEST CASES - Realistic compression scenarios
// ============================================================

const testCases: BenchmarkCase[] = [
  {
    name: 'Simple chat (baseline)',
    description: 'No repetition, minimal compression expected',
    messages: [
      { role: 'user', content: 'Hello, how are you?' },
      { role: 'assistant', content: "I'm doing well, thank you for asking! How can I help you today?" },
    ],
    contextWindow: 8192,
  },
  {
    name: 'Repeated file paste (3x)',
    description: 'Same code block pasted 3 times - tests deduplication',
    messages: [
      { role: 'user', content: 'Here is my code:\n' + Array(50).fill('  const x = "hello world";').join('\n') + '\nCan you review it?' },
      { role: 'assistant', content: 'Looks good.' },
      { role: 'user', content: Array(50).fill('  const x = "hello world";').join('\n') + '\nMore feedback?' },
      { role: 'assistant', content: 'Still looks good.' },
      { role: 'user', content: Array(50).fill('  const x = "hello world";').join('\n') + '\nAnother look?' },
    ],
    contextWindow: 8192,
  },
  {
    name: 'Filler text + code fences',
    description: 'verbose conversational fillers with protected code blocks - tests semantic layer',
    messages: [
      { role: 'user', content: 'I understand your concern. Let me help you fix this issue. Here is the solution:\n```typescript\nfunction processData(data: string[]): string {\n  return data.filter(Boolean).join(", ");\n}\n```\nThis solution handles empty strings and null values properly.' },
      { role: 'assistant', content: 'I understand your concern. Let me help you improve this. Here is an enhanced version:\n```typescript\nfunction processData(data: string[]): string {\n  return data.filter(Boolean).map(s => s.trim()).join(", ");\n}\n```\nThis enhanced version also trims whitespace from each element.' },
    ],
    contextWindow: 8192,
  },
  {
    name: 'Long conversation (truncation)',
    description: '50 turns exceeding context window - tests SmartTruncator',
    messages: (() => {
      const msgs = [];
      msgs.push({ role: 'system' as const, content: 'You are a helpful assistant.' });
      for (let i = 0; i < 30; i++) {
        msgs.push({ role: 'user' as const, content: `Question ${i}: Please explain concept ${i} in detail with examples.` });
        msgs.push({ role: 'assistant' as const, content: `Answer ${i}: This is a detailed explanation about concept ${i}. It includes examples, edge cases, and best practices for implementation.` });
      }
      return msgs;
    })(),
    contextWindow: 1000, // Small window to force truncation
  },
  {
    name: 'Chatty tool output',
    description: 'Verbose test runner output - tests toolResult layer',
    messages: [
      { role: 'user', content: 'Run tests' },
      { role: 'assistant', content:
        '```\n' + Array(200).fill('  ✓ test passes').join('\n') + '\n  Test Files  29 passed (29)\n      Tests  332 passed (332)\n  Start at  04:24:10\n  Duration  1.21s\n```' },
    ],
    contextWindow: 8192,
  },
  {
    name: 'Mixed code + realistic session',
    description: 'Bug report with evolving code, realistic multi-turn',
    messages: [
      { role: 'user', content: 'Fix this bug:\n```typescript\nfunction add(a, b) {\n  return a - b; // BUG\n}\n```' },
      { role: 'assistant', content: 'I understand. The bug is using `-` instead of `+`.\n```typescript\nfunction add(a, b) {\n  return a + b;\n}\n```' },
      { role: 'user', content: 'I understand. Thanks! Also add types:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```' },
    ],
    contextWindow: 8192,
  },
  {
    name: 'Re-pasted large file (3x 2.5k)',
    description: 'Large code block re-pasted 3 times (stress test for dedup)',
    messages: [
      { role: 'user', content: 'Review:\n' + Array(100).fill('  const x = "hello world";').join('\n') },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: Array(100).fill('  const x = "hello world";').join('\n') },
      { role: 'assistant', content: 'OK.' },
      { role: 'user', content: Array(100).fill('  const x = "hello world";').join('\n') },
    ],
    contextWindow: 8192,
  },
];

// ============================================================
// BENCHMARK RUNNER
// ============================================================

function runBenchmark(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  for (const testCase of testCases) {
    for (const level of [0, 1, 2, 3] as const) {
      const result = compressor.compress(testCase.messages, level, testCase.contextWindow);
      const originalTokens = countTokens(testCase.messages);
      const compressedTokens = countTokens(result.compressed);

      results.push({
        caseName: testCase.name,
        description: testCase.description,
        level,
        originalTokens,
        compressedTokens,
        tokensSaved: result.stats.totalSaved,
        savingsPercent: originalTokens > 0 ? Math.round((result.stats.totalSaved / originalTokens) * 100) : 0,
        breakdown: {
          deduplication: result.stats.deduplication,
          semantic: result.stats.semantic,
          truncation: result.stats.truncation,
          toolResult: result.stats.toolResult,
          pruning: result.stats.pruning,
          cache: result.stats.cache,
        },
        explain: result.explain,
      });
    }
  }

  return results;
}

function countTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
}

// ============================================================
// REPORT GENERATION
// ============================================================

function generateMarkdownTable(results: BenchmarkResult[]): string {
  const header = '| Scenario | L | Original | Compressed | Saved | % | Dedup | Semantic | Trunc | ToolRes | Prune |\n' +
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|';

  const rows = results.map(r => {
    const levelLabel = r.level === 0 ? '0' : r.level === 1 ? '1' : r.level === 2 ? '2 ' : '3*';
    return `| ${r.caseName} | ${levelLabel} | ${r.originalTokens} | ${r.compressedTokens} | ${r.tokensSaved} | ${r.savingsPercent}% | ${r.breakdown.deduplication} | ${r.breakdown.semantic} | ${r.breakdown.truncation} | ${r.breakdown.toolResult} | ${r.breakdown.pruning} |`;
  });

  return header + '\n' + rows.join('\n');
}

function generateSummary(results: BenchmarkResult[]): string {
  let md = '';

  for (const level of [0, 1, 2, 3]) {
    const levelResults = results.filter(r => r.level === level);
    const avgSavings = Math.round(
      levelResults.reduce((sum, r) => sum + r.savingsPercent, 0) / levelResults.length
    );
    const totalSaved = levelResults.reduce((sum, r) => sum + r.tokensSaved, 0);
    const label = level === 0 ? 'off' : level === 1 ? 'dedup+semantic' : level === 2 ? 'L2 (all)' : 'L3 (full)';

    md += `**Level ${level} (${label}):** Avg **${avgSavings}%** saved, total **${totalSaved}** tokens across scenarios.\n\n`;
  }

  return md;
}

function generateFullReport(results: BenchmarkResult[]): string {
  let md = '# OmniFree Compression Benchmark\n\n';
  md += `**Date:** ${new Date().toISOString().split('T')[0]}  \n`;
  md += `**Compressor:** OmniFree v1.0 (Compressor levels 0–3, ToolResult+Pruner+CachePin at 3)  \n`;
  md += '**Metric:** estimated tokens = `Math.ceil(chars / 4)`, billed-token proxy  \n';
  md += '**Runner:** `npx tsx benchmarks/compression-benchmark.ts`  \n\n';
  md += generateSummary(results);
  md += '### Results (all levels)\n\n';
  md += generateMarkdownTable(results);
  md += '\n\n';
  md += '*Legend: L = compression level (3* = opt-in, proof-at-L3 > L2 on re-pasted file 3× session).  \n';
  md += 'Cache is advisory and bills 0 in this synthetic run (no stable-prefix cache hit).*\n';

  return md;
}

// ============================================================
// MAIN
// ============================================================

console.log('🔬 Running OmniFree Compression Benchmark...\n');

const results = runBenchmark();
const report = generateFullReport(results);

const outPath = path.join(__dirname, '..', 'COMPRESSION_BENCHMARK.md');
fs.writeFileSync(outPath, report, 'utf-8');

console.log(report);
console.log(`\n✅ Results written to ${outPath}`);