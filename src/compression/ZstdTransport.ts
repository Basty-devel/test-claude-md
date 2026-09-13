import * as zstd from 'zstd-napi';
import { Message } from '../types';

/**
 * ZstdTransport — professional wire-format compression for large payloads.
 *
 * Transport-only: shrinks bytes on the wire for payloads > threshold.
 * Does NOT reduce billed token count (providers charge on decompressed content).
 * Off by default; enable via plugin config.
 *
 * Advantages over gzip: higher compression ratio at comparable speed for
 * repetitive text (code, transcripts) and better decompression throughput
 * via the native Zstandard library (via zstd-napi).
 */
export interface ZstdResult {
  /** Messages after transport pass — either original or single Zstd envelope */
  compressed: Message[];
  /** Size of compressed payload when Zstd was applied */
  compressedBytes?: number;
  /** Original payload size in bytes (UTF-8) */
  originalBytes: number;
  /** compressedBytes / originalBytes when Zstd was applied */
  ratio?: number;
  /** Whether the payload was Zstd-compressed */
  transportCompressed: boolean;
}

export class ZstdTransport {
  static readonly MIN_TOKENS = 10_000;
  static readonly MIN_BYTES = ZstdTransport.MIN_TOKENS * 4; // ~40k bytes, heuristic 4 chars/token
  private static readonly ENVELOPE_PREFIX = '__ZSTD__:';

  /**
   * Compress messages for transport. Returns a base64-encoded Zstd envelope
   * when `enabled` and payload exceeds `MIN_BYTES`; otherwise returns a copy.
   */
  compress(messages: Message[], enabled: boolean): ZstdResult {
    const originalText = this.joinMessages(messages);
    const originalBytes = Buffer.byteLength(originalText, 'utf-8');

    if (!enabled || originalBytes < ZstdTransport.MIN_BYTES) {
      return { compressed: [...messages], originalBytes, transportCompressed: false };
    }

    const compressed: Uint8Array = zstd.compress(Buffer.from(originalText, 'utf-8'));
    const b64 = Buffer.from(compressed).toString('base64');
    const ratio = compressed.length / originalBytes;

    return {
      compressed: [{ role: 'user', content: `${ZstdTransport.ENVELOPE_PREFIX}${b64}` }],
      compressedBytes: compressed.length,
      originalBytes,
      ratio,
      transportCompressed: true,
    };
  }

  /**
   * Decompress a transport-compressed message back to original text.
   * Returns null if not a Zstd envelope.
   */
  decompress(compressedContent: string): string | null {
    if (!compressedContent.startsWith(ZstdTransport.ENVELOPE_PREFIX)) return null;
    const b64 = compressedContent.slice(ZstdTransport.ENVELOPE_PREFIX.length);
    const compressedBytes = Buffer.from(b64, 'base64');
    const decompressed: Uint8Array = zstd.decompress(compressedBytes);
    return new TextDecoder().decode(decompressed);
  }

  private joinMessages(messages: Message[]): string {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  }
}