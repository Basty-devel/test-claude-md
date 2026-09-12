import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusCommand } from '../../src/commands/StatusCommand';
import { Pool } from '../../src/router/Pool';
import { Compressor } from '../../src/compression/Compressor';
import { ProviderAdapter } from '../../src/providers/ProviderAdapter';

describe('StatusCommand', () => {
  let command: StatusCommand;
  let pool: Pool;
  let compressor: Compressor;
  let mockProvider: ProviderAdapter;

  beforeEach(() => {
    pool = new Pool();
    compressor = new Compressor();
    command = new StatusCommand(pool, compressor);

    mockProvider = {
      name: 'groq',
      category: 'chat',
      quota: { remaining: 8000, total: 14000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };

    pool.add(mockProvider);
  });

  it('should format status output', () => {
    const output = command.execute();

    expect(output).toContain('groq');
    expect(output).toContain('57%'); // 8000/14000
  });

  it('should show multiple providers', () => {
    const mockProvider2: ProviderAdapter = {
      name: 'gemini',
      category: 'chat',
      quota: { remaining: 5000, total: 10000, resetWindow: 'daily', nextReset: new Date(), available: true },
      route: vi.fn(),
      healthCheck: vi.fn(),
      estimateTokens: vi.fn()
    };
    pool.add(mockProvider2);

    const output = command.execute();
    expect(output).toContain('groq');
    expect(output).toContain('gemini');
    expect(output).toContain('50%'); // 5000/10000
  });

  it('should show unavailable status for exhausted providers', () => {
    mockProvider.quota.available = false;
    mockProvider.quota.remaining = 0;

    const output = command.execute();
    expect(output).toContain('❌');
    expect(output).toContain('0%');
  });

  it('should handle empty pool', () => {
    const emptyPool = new Pool();
    const emptyCommand = new StatusCommand(emptyPool, compressor);
    const output = emptyCommand.execute();
    expect(output).toContain('📊 OmniFree Status');
  });
});