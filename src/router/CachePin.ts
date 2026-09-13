import { createHash } from 'crypto';
import { Message } from '../types';

/**
 * CachePin produces a stable advisory hash of a message prefix so that
 * successive requests sharing the same system/repo-context can target
 * the same provider connection, increasing the chance of a KV-cache hit.
 *
 * The pin is purely advisory — it never blocks routing, never overrides
 * availability checks, and degrades gracefully to the normal strategy
 * when the preferred provider is unavailable.
 */
export class CachePin {
  private _pin: string = '';
  private _header: Record<string, string> = {};

  /**
   * Compute a deterministic SHA-256 hash of the message prefix.
   * Order-sensitive: [{role:'system',content:'a'},{role:'user',content:'b'}]
   * differs from the reverse order.
   *
   * @param messages - Ordered message array (system + repo context + compressor fingerprint).
   * @returns this CachePin instance (chainable).
   */
  forMessages(messages: Message[]): this {
    const serialized = messages
      .map(m => `${m.role}:${m.content}`)
      .join('\n');

    this._pin = createHash('sha256').update(serialized).digest('hex');
    this._header = { 'x-omnifree-cache-pin': this._pin };
    return this;
  }

  /** Stable hex hash of the message prefix. */
  get pin(): string {
    return this._pin;
  }

  /** HTTP-style header to attach to the provider request. */
  get header(): Record<string, string> {
    return this._header;
  }

  /**
   * Advisory selection: if `preferred` is non-null and present in
   * `candidates`, return it; otherwise return null (caller falls
   * through to the normal strategy).
   *
   * @param preferred - Provider name cached from a prior pin, or null.
   * @param candidates - Available providers after availability filtering.
   * @returns The preferred provider name if valid, else null.
   */
  choose(preferred: string | null, candidates: string[]): string | null {
    if (preferred !== null && candidates.includes(preferred)) {
      return preferred;
    }
    return null;
  }
}
