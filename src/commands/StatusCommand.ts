import { Pool } from '../router/Pool';
import { Compressor } from '../compression/Compressor';

export class StatusCommand {
  private pool: Pool;
  private compressor: Compressor;

  constructor(pool: Pool, compressor: Compressor) {
    this.pool = pool;
    this.compressor = compressor;
  }

  execute(): string {
    const providers = this.pool.getAllProviders();
    const lines = ['📊 OmniFree Status\n'];

    for (const provider of providers) {
      const percent = Math.round((provider.quota.remaining / provider.quota.total) * 100);
      const status = provider.quota.available ? '✅' : '❌';
      lines.push(`${status} ${provider.name}: ${provider.quota.remaining}/${provider.quota.total} (${percent}%)`);
    }

    return lines.join('\n');
  }
}