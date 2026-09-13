import * as fs from 'fs/promises';
import * as path from 'path';

export interface RecallHit {
  file: string;
  symbol?: string;
  snippet: string;
  score: number;
  lastModified?: Date;
}

export interface QueryOptions {
  maxResults?: number;
  minScore?: number;
}

export interface BuildResult {
  filesIndexed: number;
  buildTime: number;
  warnings: string[];
}

export interface StalenessReport {
  totalFiles: number;
  staleFiles: number;
  lastBuild: Date;
}

interface IndexEntry {
  file: string;
  symbol?: string;
  snippet: string;
  score: number;
  lastModified?: Date;
  contentHash: string;
}

export class CodemapIndex {
  private projectRoot: string;
  private entries: IndexEntry[] = [];
  private lastBuildTime: Date = new Date(0);

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async build(): Promise<BuildResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    let filesIndexed = 0;

    // Check Serena cache availability per design spec (§Goal: "Build with Serena up front")
    const serenaCacheDir = path.join(this.projectRoot, '.serena', 'cache');
    try {
      await fs.stat(serenaCacheDir);
    } catch {
      warnings.push('serena_cache_unavailable');
    }

    // Scan src/ and docs/ directories (always runs even if Serena unavailable)
    const srcDir = path.join(this.projectRoot, 'src');
    const docsDir = path.join(this.projectRoot, 'docs');

    const srcFiles = await this.scanDirectory(srcDir);
    const docsFiles = await this.scanDirectory(docsDir);
    const allFiles = [...srcFiles, ...docsFiles];

    for (const file of allFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const stat = await fs.stat(file);
        const hash = this.hashContent(content);

        // Check if already indexed with same hash (incremental rebuild via content hash)
        const existing = this.entries.find(e => e.file === file);
        if (existing && existing.contentHash === hash) {
          continue;
        }

        const snippet = content.slice(0, 200).replace(/\n/g, ' ');
        this.entries.push({
          file,
          snippet,
          score: 0,
          lastModified: stat.mtime,
          contentHash: hash,
        });
        filesIndexed++;
      } catch {
        // Skip unreadable files (boundary: I/O failure per CLAUDE.md §2)
      }
    }

    this.lastBuildTime = new Date();

    return {
      filesIndexed,
      buildTime: Date.now() - startTime,
      warnings,
    };
  }

  query(prompt: string, options?: QueryOptions): RecallHit[] {
    const maxResults = options?.maxResults ?? 10;
    const minScore = options?.minScore ?? 0;

    // Simple lexical scoring (TF-IDF-like)
    const queryTerms = prompt.toLowerCase().split(/\s+/);
    const scored = this.entries.map(entry => {
      const text = (entry.file + ' ' + entry.snippet).toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) {
          score += 0.2;
        }
      }
      return { ...entry, score: Math.min(score, 1) };
    });

    // Filter by minScore, sort by score descending, limit by maxResults
    const filtered = scored.filter(entry => entry.score >= minScore);
    const sorted = filtered.sort((a, b) => b.score - a.score);
    const limited = sorted.slice(0, maxResults);

    return limited.map(({ contentHash, ...hit }) => hit);
  }

  getStaleness(): StalenessReport {
    const now = new Date();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const staleFiles = this.entries.filter(entry => {
      if (!entry.lastModified) return false;
      return now.getTime() - entry.lastModified.getTime() > staleThreshold;
    }).length;

    return {
      totalFiles: this.entries.length,
      staleFiles,
      lastBuild: this.lastBuildTime,
    };
  }

  private async scanDirectory(dir: string): Promise<string[]> {
    try {
      const files: string[] = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.scanDirectory(fullPath));
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}
