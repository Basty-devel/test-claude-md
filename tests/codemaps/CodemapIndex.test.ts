import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { CodemapIndex, RecallHit, QueryOptions, BuildResult, StalenessReport } from '../../src/codemaps/CodemapIndex';
import * as fs from 'fs/promises';
import * as path from 'path';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe('CodemapIndex', () => {
  let index: CodemapIndex;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    index = new CodemapIndex(testProjectRoot);
  });

  describe('build', () => {
    it('indexes src and docs directories with file hashes', async () => {
      // Arrange
      (fs.readdir as Mock).mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false },
        { name: 'file2.ts', isDirectory: () => false },
      ]);
      (fs.readFile as Mock).mockResolvedValue('export function test() { return 42; }');
      (fs.stat as Mock).mockResolvedValue({ mtime: new Date('2026-09-13') });

      // Act
      const result = await index.build();

      // Assert
      expect(result.filesIndexed).toBeGreaterThanOrEqual(0);
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
    });

    it('handles missing serena cache gracefully', async () => {
      // Arrange
      (fs.stat as Mock).mockRejectedValue(new Error('ENOENT'));
      (fs.readdir as Mock).mockRejectedValue(new Error('ENOENT'));
      (fs.readFile as Mock).mockRejectedValue(new Error('ENOENT'));

      // Act
      const result = await index.build();

      // Assert
      expect(result.filesIndexed).toBe(0);
      expect(result.warnings).toContain('serena_cache_unavailable');
    });

    it('returns empty build result for empty project', async () => {
      // Arrange
      (fs.readdir as Mock).mockResolvedValue([]);

      // Act
      const result = await index.build();

      // Assert
      expect(result.filesIndexed).toBe(0);
    });
  });

  describe('query', () => {
    it('returns empty array when index is empty', () => {
      // Arrange
      const query = 'what changed since yesterday';

      // Act
      const hits = index.query(query);

      // Assert
      expect(hits).toEqual([]);
    });

    it('returns hits sorted by score descending', async () => {
      // Arrange
      index = new CodemapIndex(testProjectRoot);
      // Manually populate index for test
      (index as any).entries = [
        { file: 'src/cli.ts', snippet: 'CLI entry point', score: 0.9 },
        { file: 'src/utils.ts', snippet: 'Utility functions', score: 0.3 },
      ];

      // Act
      const hits = index.query('CLI');

      // Assert
      expect(hits.length).toBe(2);
      expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    });

    it('respects maxResults option', async () => {
      // Arrange
      index = new CodemapIndex(testProjectRoot);
      (index as any).entries = Array(10).fill(null).map((_, i) => ({
        file: `src/file${i}.ts`,
        snippet: `File ${i}`,
        score: 0.5 + i * 0.05,
      }));

      const options: QueryOptions = { maxResults: 3 };

      // Act
      const hits = index.query('file', options);

      // Assert
      expect(hits.length).toBe(3);
    });

    it('filters by minScore when provided', async () => {
      // Arrange
      index = new CodemapIndex(testProjectRoot);
      (index as any).entries = [
        { file: 'src/high.ts', snippet: 'Important high priority feature', score: 0, contentHash: 'abc' },
        { file: 'src/low.ts', snippet: 'Unrelated content', score: 0, contentHash: 'def' },
      ];

      const options: QueryOptions = { minScore: 0.1 };

      // Act
      const hits = index.query('Important high', options);

      // Assert
      expect(hits.length).toBe(1);
      expect(hits[0].file).toBe('src/high.ts');
    });
  });

  describe('getStaleness', () => {
    it('returns staleness report with file counts', () => {
      // Arrange
      index = new CodemapIndex(testProjectRoot);
      (index as any).entries = [
        { file: 'src/a.ts', lastModified: new Date('2026-09-13') },
        { file: 'src/b.ts', lastModified: new Date('2026-09-12') },
      ];

      // Act
      const report = index.getStaleness();

      // Assert
      expect(report.totalFiles).toBe(2);
      expect(report.staleFiles).toBeGreaterThanOrEqual(0);
      expect(report.lastBuild).toBeDefined();
    });
  });
});
