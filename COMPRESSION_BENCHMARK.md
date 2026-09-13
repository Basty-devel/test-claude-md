# OmniFree Compression Benchmark

**Date:** 2026-09-13  
**Compressor:** OmniFree v1.0 (Compressor levels 0–3, ToolResult+Pruner+CachePin at 3)  
**Metric:** estimated tokens = `Math.ceil(chars / 4)`, billed-token proxy  
**Runner:** `npx tsx benchmarks/compression-benchmark.ts`  

**Level 0 (off):** Avg **0%** saved, total **0** tokens across scenarios.

**Level 1 (dedup+semantic):** Avg **9%** saved, total **707** tokens across scenarios.

**Level 2 (L2 (all)):** Avg **25%** saved, total **2945** tokens across scenarios.

**Level 3 (L3 (full)):** Avg **60%** saved, total **5808** tokens across scenarios.

### Results (all levels)

| Scenario | L | Original | Compressed | Saved | % | Dedup | Semantic | Trunc | ToolRes | Prune |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Simple chat (baseline) | 0 | 21 | 21 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Simple chat (baseline) | 1 | 21 | 21 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Simple chat (baseline) | 2  | 21 | 21 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Simple chat (baseline) | 3* | 21 | 21 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Repeated file paste (3x) | 0 | 1037 | 1037 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Repeated file paste (3x) | 1 | 1037 | 1037 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Repeated file paste (3x) | 2  | 1037 | 1037 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Repeated file paste (3x) | 3* | 1037 | 727 | 1242 | 120% | 0 | 0 | 0 | 0 | 1242 |
| Filler text + code fences | 0 | 132 | 132 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Filler text + code fences | 1 | 132 | 103 | 29 | 22% | 0 | 29 | 0 | 0 | 0 |
| Filler text + code fences | 2  | 132 | 103 | 29 | 22% | 0 | 29 | 0 | 0 | 0 |
| Filler text + code fences | 3* | 132 | 88 | 91 | 69% | 0 | 29 | 0 | 0 | 62 |
| Long conversation (truncation) | 0 | 1477 | 1477 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Long conversation (truncation) | 1 | 1477 | 1477 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Long conversation (truncation) | 2  | 1477 | 1425 | 52 | 4% | 0 | 0 | 52 | 0 | 0 |
| Long conversation (truncation) | 3* | 1477 | 1425 | 52 | 4% | 0 | 0 | 52 | 0 | 0 |
| Chatty tool output | 0 | 830 | 830 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Chatty tool output | 1 | 830 | 830 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Chatty tool output | 2  | 830 | 830 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Chatty tool output | 3* | 830 | 830 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Mixed code + realistic session | 0 | 77 | 77 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Mixed code + realistic session | 1 | 77 | 70 | 7 | 9% | 0 | 7 | 0 | 0 | 0 |
| Mixed code + realistic session | 2  | 77 | 70 | 7 | 9% | 0 | 7 | 0 | 0 | 0 |
| Mixed code + realistic session | 3* | 77 | 70 | 7 | 9% | 0 | 7 | 0 | 0 | 0 |
| Re-pasted large file (3x 2.5k) | 0 | 2030 | 2030 | 0 | 0% | 0 | 0 | 0 | 0 | 0 |
| Re-pasted large file (3x 2.5k) | 1 | 2030 | 1359 | 671 | 33% | 671 | 0 | 0 | 0 | 0 |
| Re-pasted large file (3x 2.5k) | 2  | 2030 | 960 | 2857 | 141% | 475 | 0 | 0 | 2382 | 0 |
| Re-pasted large file (3x 2.5k) | 3* | 2030 | 676 | 4416 | 218% | 333 | 0 | 0 | 2382 | 1701 |

*Legend: L = compression level (3* = opt-in, proof-at-L3 > L2 on re-pasted file 3× session).  
Cache is advisory and bills 0 in this synthetic run (no stable-prefix cache hit).*


✅ Results written to C:\Users\nese1\Desktop\test-claude-md\COMPRESSION_BENCHMARK.md
